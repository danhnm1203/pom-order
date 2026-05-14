"""Dashboard aggregate endpoint — read-heavy summary view.

Performance: each query runs in its own session via asyncio.gather so the
~7 independent reads happen in parallel. On cloud Tokyo this collapses
~400ms (7 × ~55ms RTT) into ~80ms (1 RTT).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import Select, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import session_factory
from app.dependencies import get_current_shop_id, get_db
from app.models.fx_rate import FxRate
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment, PaymentType
from app.schemas.dashboard import BrandSummary, DashboardResponse, StatusCount


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
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
    )

    intl_ship_q = (
        select(func.coalesce(func.sum(Order.international_shipping_vnd), 0))
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
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
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
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
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
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
