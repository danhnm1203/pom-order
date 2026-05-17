"""Payment recording service.

Idempotency contract:
  - Caller passes `Idempotency-Key` HTTP header (UUID v4).
  - First request inserts payment with that key.
  - Subsequent requests with the SAME key (same shop) return the EXISTING payment.
  - Different keys = different payments (caller controls deduplication).
  - Postgres unique constraint `payments_shop_id_idempotency_key_key` enforces this
    even if app-level check races.

Insert strategy: `INSERT ... ON CONFLICT DO NOTHING RETURNING id` collapses the
happy path to 1 round trip (vs SELECT-then-INSERT = 2). Replay path falls back
to a SELECT to return the existing row.

Refund flow: type='refund' creates a payment row with positive amount_vnd; the
sign is interpreted by compute_order_totals.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models.payment import Payment
from app.schemas.payment import PaymentCreate, PaymentUpdate
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

    # Happy path: 1 round trip. On conflict the row is left untouched and no id
    # is returned; we then SELECT the existing payment (replay path).
    stmt = (
        pg_insert(Payment)
        .values(
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
        .on_conflict_do_nothing(index_elements=["shop_id", "idempotency_key"])
        .returning(Payment.id)
    )
    result = await db.execute(stmt)
    new_id = result.scalar_one_or_none()

    if new_id is None:
        # Replay — fetch existing row by idempotency key
        existing = await db.execute(
            select(Payment)
            .where(Payment.shop_id == shop_id)
            .where(Payment.idempotency_key == idempotency_key)
        )
        existing_payment = existing.scalar_one_or_none()
        if existing_payment is None:
            # Conflict reported but row not found — should never happen.
            raise ApiError(409, "payment_conflict", "Conflict recording payment")
        return existing_payment

    # Newly inserted — fetch the ORM instance for return + relationships
    fetched = await db.execute(select(Payment).where(Payment.id == new_id))
    payment = fetched.scalar_one()

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


async def _get_payment_in_shop(
    db: AsyncSession, *, shop_id: UUID, order_id: UUID, payment_id: UUID
) -> Payment:
    """Fetch a payment scoped to (shop, order). Raises 404 if not found."""
    result = await db.execute(
        select(Payment)
        .where(Payment.id == payment_id)
        .where(Payment.shop_id == shop_id)
        .where(Payment.order_id == order_id)
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise ApiError(404, "payment_not_found", "Khoản thanh toán không tồn tại")
    return payment


async def update_payment(
    db: AsyncSession,
    *,
    shop_id: UUID,
    actor_id: UUID,
    order_id: UUID,
    payment_id: UUID,
    data: PaymentUpdate,
) -> Payment:
    """Edit a previously-recorded payment. Records before/after to audit_log."""
    payment = await _get_payment_in_shop(
        db, shop_id=shop_id, order_id=order_id, payment_id=payment_id
    )

    before = {
        "amount_vnd": str(payment.amount_vnd),
        "type": payment.type.value,
        "notes": payment.notes,
    }

    changed: dict[str, object] = {}
    if data.amount_vnd is not None and data.amount_vnd != payment.amount_vnd:
        changed["amount_vnd"] = str(data.amount_vnd)
        payment.amount_vnd = data.amount_vnd
    if data.type is not None and data.type != payment.type:
        changed["type"] = data.type.value
        payment.type = data.type
    if data.method_id is not None:
        payment.method_id = data.method_id
    if data.paid_at is not None:
        payment.paid_at = data.paid_at
    if data.reference is not None:
        payment.reference = data.reference
    if data.notes is not None:
        payment.notes = data.notes

    if changed:
        await log_audit(
            db,
            shop_id=shop_id,
            entity_type="payment",
            entity_id=payment.id,
            action="updated",
            actor_id=actor_id,
            changes={"from": before, "to": changed, "order_id": str(order_id)},
        )

    await db.flush()
    return payment


async def delete_payment(
    db: AsyncSession,
    *,
    shop_id: UUID,
    actor_id: UUID,
    order_id: UUID,
    payment_id: UUID,
) -> None:
    """Hard-delete a mis-entered payment. Snapshot recorded in audit_log."""
    payment = await _get_payment_in_shop(
        db, shop_id=shop_id, order_id=order_id, payment_id=payment_id
    )

    await log_audit(
        db,
        shop_id=shop_id,
        entity_type="payment",
        entity_id=payment.id,
        action="deleted",
        actor_id=actor_id,
        changes={
            "order_id": str(order_id),
            "amount_vnd": str(payment.amount_vnd),
            "type": payment.type.value,
        },
    )

    await db.delete(payment)
    await db.flush()


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
