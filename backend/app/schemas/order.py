from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import OrderStatus
from app.schemas.common import OrderTotalsResponse
from app.schemas.customer import CustomerListItem


class OrderItemBase(BaseModel):
    product_name_snapshot: Annotated[str, Field(min_length=1, max_length=500)]
    product_url_snapshot: str | None = None
    brand_name_snapshot: str | None = None
    quantity: Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)]
    unit_cost_krw: Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2)]
    unit_sale_price_vnd: Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=0)]
    notes: str | None = None


class OrderItemCreate(OrderItemBase):
    product_id: UUID | None = None
    variant_id: UUID | None = None


class OrderItemResponse(OrderItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID


class OrderCreate(BaseModel):
    """Request body for POST /orders. fx_rate is optional — service falls back to current."""

    customer_id: UUID | None = None
    address_id: UUID | None = None
    # If None, service will fetch the current rate from fx_rates table.
    # DB column is numeric(18,6) — precision enforced at storage layer.
    fx_rate_krw_to_vnd: Annotated[Decimal | None, Field(gt=0)] = None
    korean_shipping_krw: Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2)] = (
        Decimal("0")
    )
    international_shipping_vnd: Annotated[
        Decimal, Field(ge=0, max_digits=18, decimal_places=0)
    ] = Decimal("0")
    expected_arrival_date: date | None = None
    notes: str | None = None
    items: Annotated[list[OrderItemCreate], Field(min_length=1)]


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    # Required if status == 'problem'. Free text but app suggests a controlled
    # vocabulary in the UI (out_of_stock / wrong_variant / ship_delay /
    # customer_cancel / damaged / customs_hold / other).
    problem_reason: str | None = None


class OrderResponse(BaseModel):
    """Response shape for an order. fx_rate is always set (DB column is NOT NULL)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    public_token: UUID
    customer_id: UUID | None
    address_id: UUID | None
    shipment_id: UUID | None
    status: OrderStatus
    fx_rate_krw_to_vnd: Decimal
    korean_shipping_krw: Decimal
    international_shipping_vnd: Decimal
    expected_arrival_date: date | None
    notes: str | None
    problem_reason: str | None
    ordered_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]
    customer: CustomerListItem | None = None  # eager-loaded by list/detail endpoints
    totals: OrderTotalsResponse | None = None  # populated by service layer
