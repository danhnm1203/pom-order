"""Shared Pydantic schemas (response wrappers, computed values)."""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class OrderTotalsResponse(BaseModel):
    """Response shape mirroring services.order_calculations.OrderTotals."""

    model_config = ConfigDict(from_attributes=True)

    total_vnd: Decimal
    cost_vnd: Decimal
    profit_vnd: Decimal
    international_shipping_vnd: Decimal
    total_paid_vnd: Decimal
    amount_owed_vnd: Decimal
