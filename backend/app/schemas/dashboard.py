from decimal import Decimal

from pydantic import BaseModel

from app.models.order import OrderStatus


class StatusCount(BaseModel):
    status: OrderStatus
    count: int


class BrandSummary(BaseModel):
    brand_name: str
    order_count: int
    total_vnd: Decimal


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
