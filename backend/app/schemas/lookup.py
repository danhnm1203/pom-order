"""Schemas for the public price-lookup tool."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class LookupConfig(BaseModel):
    """Mutable shop-level config that drives the public lookup calculation."""

    markup_pct: Annotated[Decimal, Field(ge=0, le=2)] = Decimal("0.20")
    buying_fee_vnd: Annotated[int, Field(ge=0)] = 50000
    weight_fee_vnd: Annotated[int, Field(ge=0)] = 30000
    zalo_phone: str = ""
    zalo_message_template: str = (
        "Em muốn order: {name}{br}Link: {url}{br}Giá tham khảo: {price_vnd} ₫"
    )


class LookupConfigResponse(LookupConfig):
    """Same shape as the writable config — separate type for OpenAPI clarity."""

    model_config = ConfigDict(from_attributes=True)


class PublicShopInfo(BaseModel):
    """The public-facing fields a /tra-cuu page needs to render and CTA."""

    name: str
    zalo_phone: str
    has_zalo: bool


class LookupRequest(BaseModel):
    url: HttpUrl


class PriceBreakdown(BaseModel):
    """Show-your-work pricing so customers see how the quote is built."""

    product_vnd: int  # KRW × FX rate (no markup yet)
    markup_vnd: int  # product_vnd × markup_pct
    buying_fee_vnd: int
    weight_fee_vnd: int
    total_vnd: int


class LookupResponse(BaseModel):
    # Scraped product
    source_url: str
    brand: str | None
    name: str
    price_krw: str | None
    image_url: str | None
    # Pricing
    fx_rate: str | None  # KRW → VND multiplier at time of lookup
    breakdown: PriceBreakdown | None  # None if price_krw missing or no FX rate
    # CTA
    zalo_url: str | None  # Pre-filled Zalo deeplink (None if shop has no phone)
