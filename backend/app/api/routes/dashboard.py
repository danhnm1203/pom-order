"""Dashboard aggregate endpoint — read-heavy summary view.

Performance: each query runs in its own session via asyncio.gather so the
~7 independent reads happen in parallel. On cloud Tokyo this collapses
~400ms (7 × ~55ms RTT) into ~80ms (1 RTT).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import session_factory
from app.dependencies import get_current_shop_id, get_db
from app.models.customer import Customer
from app.models.fx_rate import FxRate
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment, PaymentType
from app.schemas.dashboard import (
    BrandProfit,
    BrandSummary,
    CustomerProfit,
    DashboardResponse,
    ProfitDashboardResponse,
    StatusCount,
)


FX_STALE_THRESHOLD_DAYS = 7


router = APIRouter()


async def _run(query: Select[Any]) -> Any:
    """Execute a query in its own session so multiple can run concurrently.

    SQLAlchemy AsyncSession serializes operations on a single session; to
    actually parallelize we need independent sessions backed by the same pool.
    """
    async with session_factory() as s:
        return await s.execute(query)


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),  # noqa: ARG001 — kept for auth dependency chain
    shop_id: UUID = Depends(get_current_shop_id),
) -> DashboardResponse:
    """Aggregate stats for the shop. All independent queries run in parallel."""
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    # Build all queries up front, then dispatch in one gather() call.
    status_q = (
        select(Order.status, func.count(Order.id))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .group_by(Order.status)
    )

    # Active orders only — exclude cancelled/completed. Items + intl shipping
    # are computed in 2 separate queries to avoid JOIN-multiplication
    # (joining orders ⨯ order_items would sum order.international_shipping N times).
    items_total_q = (
        select(
            func.coalesce(func.sum(OrderItem.unit_sale_price_vnd * OrderItem.quantity), 0)
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.CUSTOMER_RECEIVED]))
    )

    intl_ship_q = (
        select(func.coalesce(func.sum(Order.international_shipping_vnd), 0))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.CUSTOMER_RECEIVED]))
    )

    paid_q = (
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
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.CUSTOMER_RECEIVED]))
    )

    krw_items_q = (
        select(func.coalesce(func.sum(OrderItem.unit_cost_krw * OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.created_at >= month_start)
    )

    krw_ship_q = (
        select(func.coalesce(func.sum(Order.korean_shipping_krw), 0))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.created_at >= month_start)
    )

    top_brands_q = (
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

    active_q = (
        select(func.count(Order.id))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.CUSTOMER_RECEIVED]))
    )

    fx_q = (
        select(FxRate.effective_from)
        .where(FxRate.shop_id == shop_id)
        .where(FxRate.base_currency == "KRW")
        .where(FxRate.quote_currency == "VND")
        .where(FxRate.effective_to.is_(None))
    )

    (
        status_res,
        items_total_res,
        intl_ship_res,
        paid_res,
        krw_items_res,
        krw_ship_res,
        top_brands_res,
        active_res,
        fx_res,
    ) = await asyncio.gather(
        _run(status_q),
        _run(items_total_q),
        _run(intl_ship_q),
        _run(paid_q),
        _run(krw_items_q),
        _run(krw_ship_q),
        _run(top_brands_q),
        _run(active_q),
        _run(fx_q),
    )

    # Status counts
    status_counts = [
        StatusCount(status=row[0], count=row[1]) for row in status_res.all()
    ]

    # Amount owed = items + intl shipping − net payments
    items_total = Decimal(items_total_res.scalar() or 0)
    intl_ship_total = Decimal(intl_ship_res.scalar() or 0)
    total_paid = Decimal(paid_res.scalar() or 0)
    total_amount_owed = items_total + intl_ship_total - total_paid

    # KRW spent this month
    krw_items_total = Decimal(krw_items_res.scalar() or 0)
    krw_ship_total = Decimal(krw_ship_res.scalar() or 0)
    total_krw_raw = krw_items_total + krw_ship_total

    # Top brands
    top_brands = [
        BrandSummary(
            brand_name=row[0] or "(no brand)",
            order_count=row[1],
            total_vnd=Decimal(row[2]),
        )
        for row in top_brands_res.all()
    ]

    # Active count
    active_count = active_res.scalar() or 0

    # FX freshness
    fx_age_days: int | None = None
    fx_is_stale = False
    current_rate_set_at = fx_res.scalar_one_or_none()
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


# Profit aggregations exclude cancelled orders only. Completed orders are included
# because they represent realised profit; only cancelled orders never made money.
_PROFIT_EXCLUDED_STATUSES = [OrderStatus.CANCELLED]
_PROFIT_LIMIT = 10


@router.get("/profit", response_model=ProfitDashboardResponse)
async def get_profit_dashboard(
    window_months: int = Query(12, ge=1, le=60),
    db: AsyncSession = Depends(get_db),  # noqa: ARG001 — auth dependency chain
    shop_id: UUID = Depends(get_current_shop_id),
) -> ProfitDashboardResponse:
    """Top customers + top brands by profit over the requested time window.

    Profit math mirrors compute_order_totals (the source of truth):
      - Per-customer profit: revenue − cost − international_shipping
        Cost includes Korean shipping × FX (per-order overhead attributable to
        the customer who placed the order).
      - Per-brand profit: items only (revenue − cost_krw × fx). Korean and
        international shipping are per-order overheads, not per-brand, so
        excluding them gives a clean "is this brand profitable to sell" signal.

    FX rate uses each order's snapshotted rate, not the current rate — historical
    profit must reflect what was actually quoted at order time.
    """
    now = datetime.now(timezone.utc)
    # Approximate "N months" as N × 30 days. Exact calendar math not worth the
    # complexity at this scale — owner asks "last year" to mean "last ~365 days".
    window_start = now - timedelta(days=window_months * 30)

    # Per-order subquery: collapse line items into one row per order so the
    # outer aggregation can JOIN customers without inflating intl_shipping.
    per_order_sq = (
        select(
            Order.id.label("order_id"),
            Order.customer_id.label("customer_id"),
            Order.fx_rate_krw_to_vnd.label("fx"),
            Order.korean_shipping_krw.label("krw_ship"),
            Order.international_shipping_vnd.label("intl_ship"),
            func.coalesce(
                func.sum(OrderItem.unit_sale_price_vnd * OrderItem.quantity), 0
            ).label("revenue_vnd"),
            func.coalesce(
                func.sum(OrderItem.unit_cost_krw * OrderItem.quantity), 0
            ).label("items_cost_krw"),
        )
        .join(OrderItem, OrderItem.order_id == Order.id, isouter=True)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in(_PROFIT_EXCLUDED_STATUSES))
        .where(Order.created_at >= window_start)
        .where(Order.customer_id.is_not(None))
        .group_by(Order.id)
        .subquery()
    )

    customer_revenue = func.sum(per_order_sq.c.revenue_vnd)
    customer_cost = func.sum(
        (per_order_sq.c.items_cost_krw + per_order_sq.c.krw_ship) * per_order_sq.c.fx
        + per_order_sq.c.intl_ship
    )
    customers_q = (
        select(
            Customer.id,
            Customer.name,
            func.count(per_order_sq.c.order_id).label("order_count"),
            customer_revenue.label("revenue_vnd"),
            customer_cost.label("cost_vnd"),
            (customer_revenue - customer_cost).label("profit_vnd"),
        )
        .join(per_order_sq, per_order_sq.c.customer_id == Customer.id)
        .where(Customer.shop_id == shop_id)
        .where(Customer.deleted_at.is_(None))
        .group_by(Customer.id, Customer.name)
        .order_by(desc("profit_vnd"))
        .limit(_PROFIT_LIMIT)
    )

    # Brand aggregation — joins items × orders directly (no per-order subquery
    # needed because we are aggregating items, and intl/Korean shipping are
    # intentionally excluded from brand margin).
    brand_revenue = func.sum(OrderItem.unit_sale_price_vnd * OrderItem.quantity)
    brand_cost = func.sum(
        OrderItem.unit_cost_krw * OrderItem.quantity * Order.fx_rate_krw_to_vnd
    )
    brands_q = (
        select(
            OrderItem.brand_name_snapshot.label("brand_name"),
            func.count(func.distinct(Order.id)).label("order_count"),
            func.count(OrderItem.id).label("item_count"),
            brand_revenue.label("revenue_vnd"),
            brand_cost.label("cost_vnd"),
            (brand_revenue - brand_cost).label("profit_vnd"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in(_PROFIT_EXCLUDED_STATUSES))
        .where(Order.created_at >= window_start)
        .where(OrderItem.brand_name_snapshot.is_not(None))
        .group_by(OrderItem.brand_name_snapshot)
        .order_by(desc("profit_vnd"))
        .limit(_PROFIT_LIMIT)
    )

    customers_res, brands_res = await asyncio.gather(
        _run(customers_q),
        _run(brands_q),
    )

    top_customers = [
        CustomerProfit(
            customer_id=row[0],
            customer_name=row[1],
            order_count=row[2],
            revenue_vnd=Decimal(row[3] or 0),
            cost_vnd=Decimal(row[4] or 0),
            profit_vnd=Decimal(row[5] or 0),
        )
        for row in customers_res.all()
    ]

    top_brands: list[BrandProfit] = []
    for row in brands_res.all():
        revenue = Decimal(row[3] or 0)
        cost = Decimal(row[4] or 0)
        profit = Decimal(row[5] or 0)
        margin: Decimal | None = None
        if revenue != 0:
            margin = (profit / revenue * Decimal("100")).quantize(Decimal("0.01"))
        top_brands.append(
            BrandProfit(
                brand_name=row[0],
                order_count=row[1],
                item_count=row[2],
                revenue_vnd=revenue,
                cost_vnd=cost,
                profit_vnd=profit,
                margin_pct=margin,
            )
        )

    return ProfitDashboardResponse(
        window_months=window_months,
        top_customers_by_profit=top_customers,
        top_brands_by_profit=top_brands,
    )
