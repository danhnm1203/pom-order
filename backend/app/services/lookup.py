"""Public price-lookup service — orchestrates scrape + price calc + Zalo CTA.

Lives behind an unauthenticated route, so guard against:
  - Abuse: per-IP rate limit (in-memory; switch to Redis if multi-instance)
  - Cost: scrape result cache (1h TTL); same URL won't hit the supplier twice
  - Cloudflare blowback: cap parallelism implicitly via FastAPI's worker pool
"""

from __future__ import annotations

import threading
import time
from collections import deque
from decimal import Decimal
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.exceptions import ApiError
from app.models.fx_rate import FxRate
from app.models.shop import Shop
from app.schemas.lookup import (
    LookupConfig,
    LookupResponse,
    PriceBreakdown,
    PublicShopInfo,
)
from app.services.scraper import ScrapedProduct, scrape_product


# ---- Rate limiting (per IP, sliding-window) ---------------------------------

_RATE_LOCK = threading.Lock()
_RATE_BUCKETS: dict[str, deque[float]] = {}
_RATE_LIMIT_PER_HOUR = 30
_RATE_WINDOW_S = 3600.0


def _check_rate_limit(client_ip: str) -> None:
    """Allow up to 30 requests per IP per rolling hour. Raise 429 on overflow."""
    now = time.time()
    with _RATE_LOCK:
        bucket = _RATE_BUCKETS.setdefault(client_ip, deque())
        # Drop stale timestamps
        while bucket and bucket[0] < now - _RATE_WINDOW_S:
            bucket.popleft()
        if len(bucket) >= _RATE_LIMIT_PER_HOUR:
            retry_in = int(bucket[0] + _RATE_WINDOW_S - now)
            raise ApiError(
                429,
                "rate_limit_exceeded",
                f"Bạn đã dùng tool quá nhiều. Thử lại sau {retry_in // 60} phút.",
            )
        bucket.append(now)


# ---- Scrape cache (per URL, 1h TTL) -----------------------------------------

_CACHE_LOCK = threading.Lock()
_CACHE: dict[str, tuple[float, ScrapedProduct]] = {}
_CACHE_TTL_S = 3600.0


def _cache_get(url: str) -> ScrapedProduct | None:
    now = time.time()
    with _CACHE_LOCK:
        entry = _CACHE.get(url)
        if entry is None:
            return None
        ts, product = entry
        if ts < now - _CACHE_TTL_S:
            _CACHE.pop(url, None)
            return None
        return product


def _cache_put(url: str, product: ScrapedProduct) -> None:
    with _CACHE_LOCK:
        _CACHE[url] = (time.time(), product)


# ---- Lookup orchestration ---------------------------------------------------


def _coerce_config(raw: dict[str, Any] | None) -> LookupConfig:
    """Hydrate stored JSONB into a typed config; missing keys → defaults."""
    return LookupConfig(**(raw or {}))


async def get_shop_lookup_config(db: AsyncSession) -> tuple[Shop, LookupConfig]:
    """Fetch the default shop + its lookup config."""
    shop_id = settings.default_shop_id
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    shop = result.scalar_one_or_none()
    if shop is None:
        raise ApiError(500, "shop_not_configured", "Shop chưa được tạo")
    config = _coerce_config(shop.lookup_config)
    return shop, config


async def update_shop_lookup_config(
    db: AsyncSession, *, new_config: LookupConfig
) -> LookupConfig:
    shop, _ = await get_shop_lookup_config(db)
    shop.lookup_config = new_config.model_dump(mode="json")
    await db.flush()
    return new_config


async def public_shop_info(db: AsyncSession) -> PublicShopInfo:
    shop, config = await get_shop_lookup_config(db)
    return PublicShopInfo(
        name=shop.name,
        zalo_phone=config.zalo_phone,
        has_zalo=bool(config.zalo_phone.strip()),
    )


async def _current_fx_rate(db: AsyncSession) -> Decimal | None:
    """Latest active KRW→VND rate for the default shop."""
    shop_id = settings.default_shop_id
    result = await db.execute(
        select(FxRate.rate)
        .where(FxRate.shop_id == shop_id)
        .where(FxRate.base_currency == "KRW")
        .where(FxRate.quote_currency == "VND")
        .where(FxRate.effective_to.is_(None))
        .order_by(FxRate.effective_from.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _build_zalo_url(phone: str, template: str, *, name: str, url: str, price_vnd: int | None) -> str | None:
    """Build a Zalo deeplink with the supplied message template.

    Template placeholders: {name}, {url}, {price_vnd}, {br} (newline).
    """
    phone = phone.strip()
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    if not digits:
        return None
    price_str = f"{price_vnd:,}" if price_vnd is not None else "(báo giá sau)"
    msg = (
        template.replace("{name}", name)
        .replace("{url}", url)
        .replace("{price_vnd}", price_str)
        .replace("{br}", "\n")
    )
    return f"https://zalo.me/{digits}?text={quote(msg)}"


def _compute_breakdown(
    price_krw: str | None,
    fx_rate: Decimal | None,
    config: LookupConfig,
) -> PriceBreakdown | None:
    """Apply the pricing formula:
        product_vnd = krw × fx_rate
        markup_vnd  = product_vnd × markup_pct
        total       = product_vnd + markup_vnd + buying_fee + weight_fee
    Returns None if price or FX rate is missing.
    """
    if price_krw is None or fx_rate is None:
        return None
    try:
        krw = Decimal(price_krw)
    except Exception:  # noqa: BLE001 — coerce any conversion failure to None
        return None
    product_vnd = krw * fx_rate
    markup_vnd = product_vnd * config.markup_pct
    total_vnd = product_vnd + markup_vnd + config.buying_fee_vnd + config.weight_fee_vnd
    return PriceBreakdown(
        product_vnd=int(product_vnd),
        markup_vnd=int(markup_vnd),
        buying_fee_vnd=int(config.buying_fee_vnd),
        weight_fee_vnd=int(config.weight_fee_vnd),
        total_vnd=int(total_vnd),
    )


async def perform_lookup(
    db: AsyncSession,
    *,
    url: str,
    client_ip: str,
) -> LookupResponse:
    _check_rate_limit(client_ip)

    cached = _cache_get(url)
    if cached is not None:
        product = cached
    else:
        product = await scrape_product(url)
        _cache_put(url, product)

    _, config = await get_shop_lookup_config(db)
    fx_rate = await _current_fx_rate(db)
    breakdown = _compute_breakdown(product.price_krw, fx_rate, config)

    zalo_url = _build_zalo_url(
        config.zalo_phone,
        config.zalo_message_template,
        name=product.name,
        url=product.source_url,
        price_vnd=breakdown.total_vnd if breakdown else None,
    )

    return LookupResponse(
        source_url=product.source_url,
        brand=product.brand,
        name=product.name,
        price_krw=product.price_krw,
        image_url=product.image_url,
        fx_rate=str(fx_rate) if fx_rate is not None else None,
        breakdown=breakdown,
        zalo_url=zalo_url,
    )
