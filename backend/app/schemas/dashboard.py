from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.models.order import OrderStatus


class StatusCount(BaseModel):
    status: OrderStatus
    count: int


class BrandSummary(BaseModel):
    brand_name: str
    order_count: int
    total_vnd: Decimal


class CustomerProfit(BaseModel):
    """Aggregate profit per customer over a time window.

    Profit mirrors compute_order_totals: revenue − cost − international shipping.
    Cost includes Korean shipping converted at each order's snapshotted FX rate.
    """

    customer_id: UUID
    customer_name: str
    order_count: int
    revenue_vnd: Decimal
    cost_vnd: Decimal
    profit_vnd: Decimal


class BrandProfit(BaseModel):
    """Aggregate profit per brand over a time window.

    Brand profit is item-only: revenue − (cost_krw × fx). Korean and international
    shipping are per-order, not per-brand, so they are excluded from brand margin
    to keep the "is this brand profitable" signal pure.
    """

    brand_name: str
    order_count: int
    item_count: int
    revenue_vnd: Decimal
    cost_vnd: Decimal
    profit_vnd: Decimal
    margin_pct: Decimal | None  # null when revenue == 0


class ProfitDashboardResponse(BaseModel):
    window_months: int
    top_customers_by_profit: list[CustomerProfit]
    top_brands_by_profit: list[BrandProfit]


class DashboardResponse(BaseModel):
    """Aggregate stats for the shop dashboard.

    Computed in service layer; not cached. At 10-50 orders/month scale,
    these queries return in ms.
    """

    status_counts: list[StatusCount]
    total_amount_owed_vnd: Decimal      # sum of (total + intl_ship − paid) for active orders
    total_krw_ordered_this_month: Decimal  # sum of cost_krw × qty for orders ordered_at this month
    top_brands_this_month: list[BrandSummary]
    active_orders_count: int            # not cancelled, not completed

    # FX rate freshness — warn user if rate hasn't been updated recently
    fx_rate_age_days: int | None = None   # None if no current rate set
    fx_rate_is_stale: bool = False         # true if > 7 days old
