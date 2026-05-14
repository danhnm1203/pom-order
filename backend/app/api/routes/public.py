"""Public endpoints — NO authentication required.

Critical security rule: never leak customer PII (phone, address detail) or
internal financial state (cost_vnd, profit_vnd) on public endpoints.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.exceptions import ApiError
from app.models.order import Order
from app.services.order_calculations import compute_order_totals


router = APIRouter()


@router.get("/orders/{token}")
async def get_public_order(
    token: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Read-only public order summary. Accessible via UUID token without auth.

    Returns ONLY safe fields. NEVER returns:
      - customer.phone, address detail, name in clear (only first letter + ***)
      - cost_vnd, profit_vnd
      - internal notes
    """
    result = await db.execute(
        select(Order).where(Order.public_token == token).options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if order is None or order.deleted_at is not None:
        raise ApiError(404, "order_not_found", "Đơn không tồn tại hoặc đã bị xóa")

    # Compute totals (without exposing cost)
    totals = compute_order_totals(
        items=list(order.items),
        payments=[],  # TODO: load payments when route is fully implemented
        fx_rate_krw_to_vnd=order.fx_rate_krw_to_vnd,
        korean_shipping_krw=order.korean_shipping_krw,
        international_shipping_vnd=order.international_shipping_vnd,
    )

    return {
        "status": order.status.value,
        "created_at": order.created_at.isoformat(),
        "expected_arrival_date": (
            order.expected_arrival_date.isoformat() if order.expected_arrival_date else None
        ),
        "items": [
            {
                "product_name": item.product_name_snapshot,
                "brand": item.brand_name_snapshot,
                "quantity": str(item.quantity),
                "notes": item.notes,
                # NOTE: do NOT expose unit_cost_krw
            }
            for item in order.items
        ],
        "total_vnd": str(totals.total_vnd),
        "international_shipping_vnd": str(totals.international_shipping_vnd),
        "amount_owed_vnd": str(totals.amount_owed_vnd),
        # NOTE: cost_vnd and profit_vnd intentionally omitted
    }
