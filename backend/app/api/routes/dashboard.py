"""Dashboard aggregate endpoint — read-heavy summary view."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_db
from app.models.fx_rate import FxRate
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment, PaymentType
from app.schemas.dashboard import BrandSummary, DashboardResponse, StatusCount


FX_STALE_THRESHOLD_DAYS = 7


router = APIRouter()


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> DashboardResponse:
    """Aggregate stats for the shop. Computed at 10-50 đơn/tháng scale = sub-100ms."""

    # 1. Status counts
    status_result = await db.execute(
        select(Order.status, func.count(Order.id))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .group_by(Order.status)
    )
    status_counts = [
        StatusCount(status=row[0], count=row[1]) for row in status_result.all()
    ]

    # 2. Total amount owed (active orders only — exclude cancelled/completed)
    # Split into 2 queries to avoid the JOIN-multiplication bug:
    # joining orders ⨯ order_items would sum order.international_shipping N times
    # (once per item) instead of once per order.
    items_total_result = await db.execute(
        select(
            func.coalesce(
                func.sum(OrderItem.unit_sale_price_vnd * OrderItem.quantity), 0
            )
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
    )
    items_total = Decimal(items_total_result.scalar() or 0)

    intl_ship_result = await db.execute(
        select(func.coalesce(func.sum(Order.international_shipping_vnd), 0))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
    )
    intl_ship_total = Decimal(intl_ship_result.scalar() or 0)
    gross_owed = items_total + intl_ship_total

    # Subtract paid amounts (net of refunds) for active orders
    paid_result = await db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (Payment.type == PaymentType.REFUND, -Payment.amount_vnd),
                        else_=Payment.amount_vnd,
                    )
                ),
                0,
            )
        )
        .join(Order, Order.id == Payment.order_id)
        .where(Payment.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
    )
    total_paid_raw = paid_result.scalar() or 0
    total_paid = Decimal(total_paid_raw)
    total_amount_owed = gross_owed - total_paid

    # 3. Total KRW ordered this month — same split as #2 to avoid join multiplication
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    krw_items_result = await db.execute(
        select(func.coalesce(func.sum(OrderItem.unit_cost_krw * OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.created_at >= month_start)
    )
    krw_items_total = Decimal(krw_items_result.scalar() or 0)

    krw_ship_result = await db.execute(
        select(func.coalesce(func.sum(Order.korean_shipping_krw), 0))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.created_at >= month_start)
    )
    krw_ship_total = Decimal(krw_ship_result.scalar() or 0)
    total_krw_raw = krw_items_total + krw_ship_total

    # 4. Top brands this month (by order count)
    top_brands_result = await db.execute(
        select(
            OrderItem.brand_name_snapshot,
            func.count(func.distinct(Order.id)).label("order_count"),
            func.coalesce(
                func.sum(OrderItem.unit_sale_price_vnd * OrderItem.quantity), 0
            ).label("total_vnd"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.created_at >= month_start)
        .where(OrderItem.brand_name_snapshot.isnot(None))
        .group_by(OrderItem.brand_name_snapshot)
        .order_by(desc("order_count"))
        .limit(5)
    )
    top_brands = [
        BrandSummary(
            brand_name=row[0] or "(no brand)",
            order_count=row[1],
            total_vnd=Decimal(row[2]),
        )
        for row in top_brands_result.all()
    ]

    # 5. Active orders count (not cancelled, not completed)
    active_result = await db.execute(
        select(func.count(Order.id))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
    )
    active_count = active_result.scalar() or 0

    # 6. FX rate freshness — warn if current rate is older than threshold
    fx_age_days: int | None = None
    fx_is_stale = False
    fx_result = await db.execute(
        select(FxRate.effective_from)
        .where(FxRate.shop_id == shop_id)
        .where(FxRate.base_currency == "KRW")
        .where(FxRate.quote_currency == "VND")
        .where(FxRate.effective_to.is_(None))
    )
    current_rate_set_at = fx_result.scalar_one_or_none()
    if current_rate_set_at is not None:
        delta = now - current_rate_set_at
        fx_age_days = delta.days
        fx_is_stale = fx_age_days > FX_STALE_THRESHOLD_DAYS

    return DashboardResponse(
        status_counts=status_counts,
        total_amount_owed_vnd=total_amount_owed,
        total_krw_ordered_this_month=Decimal(total_krw_raw),
        top_brands_this_month=top_brands,
        active_orders_count=active_count,
        fx_rate_age_days=fx_age_days,
        fx_rate_is_stale=fx_is_stale,
    )
