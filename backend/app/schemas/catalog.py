"""Product catalog schemas.

Brands are upserted by name (unique per shop) — operator types a brand name when
creating a product, backend resolves or creates the Brand row.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProductBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=500)]
    name_kr: Annotated[str | None, Field(max_length=500)] = None
    url: Annotated[str | None, Field(max_length=2000)] = None
    base_price_krw: Annotated[
        Decimal | None, Field(ge=0, max_digits=18, decimal_places=2)
    ] = None


class ProductCreate(ProductBase):
    # Free text — service upserts into brands table per shop.
    brand_name: Annotated[str | None, Field(max_length=200)] = None


class ProductUpdate(BaseModel):
    name: Annotated[str | None, Field(min_length=1, max_length=500)] = None
    name_kr: Annotated[str | None, Field(max_length=500)] = None
    url: Annotated[str | None, Field(max_length=2000)] = None
    base_price_krw: Annotated[
        Decimal | None, Field(ge=0, max_digits=18, decimal_places=2)
    ] = None
    brand_name: Annotated[str | None, Field(max_length=200)] = None


class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    brand_id: UUID | None
    brand_name: str | None  # denormalized from brands table for convenience
    created_at: datetime
    updated_at: datetime


class ProductStats(BaseModel):
    """Aggregate quantities derived from order_items joined with orders.

    Status mapping (matches the operator's mental model):
      - total_qty:     orders not cancelled
      - ordered_qty:   orders with status in (ordered, in_transit, arrived,
                       delivered, completed) — i.e. already placed with Korea
      - delivered_qty: orders with status in (delivered, completed)
      - pending_qty:   total - ordered (still need to place with Korea)
    """

    total_qty: Decimal
    ordered_qty: Decimal
    delivered_qty: Decimal
    pending_qty: Decimal


class ProductWithStats(ProductResponse):
    stats: ProductStats
