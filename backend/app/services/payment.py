"""Payment recording service.

Idempotency contract:
  - Caller passes `Idempotency-Key` HTTP header (UUID v4).
  - First request inserts payment with that key.
  - Subsequent requests with the SAME key (same shop) return the EXISTING payment.
  - Different keys = different payments (caller controls deduplication).
  - Postgres unique constraint `payments_shop_id_idempotency_key_key` enforces this
    even if app-level check races.

Refund flow: type='refund' creates a payment row with positive amount_vnd; the
sign is interpreted by compute_order_totals.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models.payment import Payment
from app.schemas.payment import PaymentCreate
from app.services.audit import log_audit


async def record_payment(
    db: AsyncSession,
    *,
    shop_id: UUID,
    actor_id: UUID,
    order_id: UUID,
    idempotency_key: UUID,
    data: PaymentCreate,
) -> Payment:
    """Insert a payment, idempotent by (shop_id, idempotency_key).

    If the key already exists for this shop, return the existing payment (HTTP
    behavior at route layer should be 200 OK, not 201 Created, for replays).
    """
    # Verify order belongs to shop (avoid recording payment on someone else's order)
    from app.models.order import Order  # local import

    order_check = await db.execute(
        select(Order.id).where(Order.id == order_id).where(Order.shop_id == shop_id)
    )
    if order_check.scalar_one_or_none() is None:
        raise ApiError(404, "order_not_found", "Đơn hàng không thuộc shop này")

    # Idempotency: short-circuit if key already exists
    existing = await db.execute(
        select(Payment)
        .where(Payment.shop_id == shop_id)
        .where(Payment.idempotency_key == idempotency_key)
    )
    existing_payment = existing.scalar_one_or_none()
    if existing_payment is not None:
        # Idempotent replay — return existing record
        return existing_payment

    # Wrap INSERT in a SAVEPOINT so an IntegrityError (race condition on the
    # unique constraint) rolls back ONLY this nested transaction. The outer
    # transaction owned by `get_db` stays alive for the audit log insert below.
    payment = Payment(
        order_id=order_id,
        shop_id=shop_id,
        idempotency_key=idempotency_key,
        amount_vnd=data.amount_vnd,
        type=data.type,
        method_id=data.method_id,
        paid_at=data.paid_at,
        reference=data.reference,
        notes=data.notes,
    )
    try:
        async with db.begin_nested():
            db.add(payment)
            await db.flush()
    except IntegrityError as exc:
        # Savepoint already rolled back. Session is still usable.
        existing = await db.execute(
            select(Payment)
            .where(Payment.shop_id == shop_id)
            .where(Payment.idempotency_key == idempotency_key)
        )
        existing_payment = existing.scalar_one_or_none()
        if existing_payment is not None:
            return existing_payment
        raise ApiError(409, "payment_conflict", "Conflict recording payment") from exc

    await log_audit(
        db,
        shop_id=shop_id,
        entity_type="payment",
        entity_id=payment.id,
        action="created",
        actor_id=actor_id,
        changes={
            "order_id": str(order_id),
            "amount_vnd": str(data.amount_vnd),
            "type": data.type.value,
        },
    )

    await db.flush()
    return payment


async def list_payments_for_order(
    db: AsyncSession,
    *,
    shop_id: UUID,
    order_id: UUID,
) -> list[Payment]:
    """List payments for one order, oldest first."""
    result = await db.execute(
        select(Payment)
        .where(Payment.shop_id == shop_id)
        .where(Payment.order_id == order_id)
        .order_by(Payment.paid_at.asc())
    )
    return list(result.scalars().all())
