"""Product URL scraping endpoint — used by NewOrderPage to pre-fill item rows."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, HttpUrl

from app.dependencies import get_current_shop_id  # noqa: F401 — auth via dep chain
from app.services.scraper import scrape_product


router = APIRouter()


class ScrapeProductRequest(BaseModel):
    url: HttpUrl


class ScrapeProductResponse(BaseModel):
    source_url: str
    brand: str | None
    name: str
    price_krw: Annotated[str | None, Field(description="KRW as digit string; None if not parseable")]
    image_url: str | None


@router.post("/product", response_model=ScrapeProductResponse)
async def scrape_product_endpoint(
    body: ScrapeProductRequest,
    _: UUID = Depends(get_current_shop_id),  # noqa: ARG001 — gates the endpoint to authed users
) -> ScrapeProductResponse:
    """Run a headless browser fetch + DOM scrape against the supplier URL.

    Typical latency on cloud Tokyo: 4-8s per call (chromium cold start + Cloudflare
    challenge pass + DOM settle). The frontend should show a loading state.
    """
    result = await scrape_product(str(body.url))
    return ScrapeProductResponse(
        source_url=result.source_url,
        brand=result.brand,
        name=result.name,
        price_krw=result.price_krw,
        image_url=result.image_url,
    )
