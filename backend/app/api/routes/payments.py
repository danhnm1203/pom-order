"""Payment recording endpoints (nested under /orders/{order_id}/payments).

Idempotency contract:
  Client sends `Idempotency-Key: <uuid-v4>` HTTP header. Same key → same payment
  is returned (200 OK on replay, 201 Created on first insert). Missing header
  is rejected with 400 — we never accept payments without an idempotency token.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_current_user_id, get_db
from app.exceptions import ApiError
from app.schemas.payment import PaymentCreate, PaymentResponse
from app.services import payment as payment_service


router = APIRouter()


@router.post("/{order_id}/payments", response_model=PaymentResponse)
async def record_payment(
    order_id: UUID,
    data: PaymentCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
    user_id: UUID = Depends(get_current_user_id),
) -> PaymentResponse:
    if not idempotency_key:
        raise ApiError(
            400,
            "missing_idempotency_key",
            "Header 'Idempotency-Key' is required for payment writes",
        )
    try:
        key_uuid = UUID(idempotency_key)
    except ValueError as exc:
        raise ApiError(
            400, "invalid_idempotency_key", "Idempotency-Key must be a valid UUID"
        ) from exc

    # Check whether this is a replay BEFORE recording (to set HTTP status correctly)
    from sqlalchemy import select

    from app.models.payment import Payment as PaymentModel

    existing = await db.execute(
        select(PaymentModel.id)
        .where(PaymentModel.shop_id == shop_id)
        .where(PaymentModel.idempotency_key == key_uuid)
    )
    is_replay = existing.scalar_one_or_none() is not None

    payment = await payment_service.record_payment(
        db,
        shop_id=shop_id,
        actor_id=user_id,
        order_id=order_id,
        idempotency_key=key_uuid,
        data=data,
    )

    response.status_code = (
        status.HTTP_200_OK if is_replay else status.HTTP_201_CREATED
    )
    return PaymentResponse.model_validate(payment)


@router.get("/{order_id}/payments", response_model=list[PaymentResponse])
async def list_payments(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> list[PaymentResponse]:
    payments = await payment_service.list_payments_for_order(
        db, shop_id=shop_id, order_id=order_id
    )
    return [PaymentResponse.model_validate(p) for p in payments]
