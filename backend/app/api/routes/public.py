"""Public endpoints — NO authentication required.

Critical security rule: never leak customer PII (phone, address detail) or
internal financial state (cost_vnd, profit_vnd) on public endpoints.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.exceptions import ApiError
from app.models.order import Order
from app.models.payment import Payment
from app.schemas.lookup import LookupRequest, LookupResponse, PublicShopInfo
from app.services.lookup import perform_lookup, public_shop_info
from app.services.order_calculations import compute_order_totals


router = APIRouter()


def _client_ip(request: Request) -> str:
    """Extract the originating IP, trusting one upstream proxy hop.

    On Railway/Vercel/Fly, the platform proxy sets X-Forwarded-For. We honor
    the first IP in that list. Falls back to direct socket peer.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/shop-info", response_model=PublicShopInfo)
async def get_public_shop_info(db: AsyncSession = Depends(get_db)) -> PublicShopInfo:
    """Surface the shop name + whether Zalo CTA is configured (no phone leak)."""
    return await public_shop_info(db)


@router.post("/lookup", response_model=LookupResponse)
async def public_lookup(
    body: LookupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LookupResponse:
    """Unauthenticated price lookup.

    Rate-limited at 30 req/hour/IP. Scrape results cached 1h per URL. Returns
    scraped product + estimated VND breakdown + pre-filled Zalo deeplink.
    """
    return await perform_lookup(db, url=str(body.url), client_ip=_client_ip(request))


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

    # Load payments separately — Order has no relationship to Payment yet, and
    # the customer-facing page must subtract deposits from amount_owed (else
    # the page double-charges after the customer has paid the cọc).
    payments_res = await db.execute(
        select(Payment).where(Payment.order_id == order.id)
    )
    payments = list(payments_res.scalars().all())

    # Compute totals (without exposing cost)
    totals = compute_order_totals(
        items=list(order.items),
        payments=payments,
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
        # Tracking number is safe to expose — the customer needs it to self-track
        # on the carrier site. Null until the order reaches shipping_to_customer.
        "tracking_number": order.tracking_number,
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
        "total_paid_vnd": str(totals.total_paid_vnd),
        "amount_owed_vnd": str(totals.amount_owed_vnd),
        # NOTE: cost_vnd and profit_vnd intentionally omitted
    }
