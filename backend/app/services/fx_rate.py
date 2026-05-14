"""FX rate management.

Schema invariant: at most one current rate per (shop, base, quote) pair, enforced
by partial unique index `fx_rates_current_per_pair` where `effective_to is null`.

Setting a new rate is a 2-step atomic operation:
  1. UPDATE current row to set effective_to = now()
  2. INSERT new row with effective_to = null
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models.fx_rate import FxRate


async def get_current_rate(
    db: AsyncSession,
    *,
    shop_id: UUID,
    base_currency: str = "KRW",
    quote_currency: str = "VND",
) -> FxRate:
    """Return the active FX rate for a currency pair. Raises 404 if none."""
    result = await db.execute(
        select(FxRate)
        .where(FxRate.shop_id == shop_id)
        .where(FxRate.base_currency == base_currency)
        .where(FxRate.quote_currency == quote_currency)
        .where(FxRate.effective_to.is_(None))
    )
    rate = result.scalar_one_or_none()
    if rate is None:
        raise ApiError(
            404,
            "no_fx_rate",
            f"No active FX rate for {base_currency}/{quote_currency}. Set one first.",
        )
    return rate


async def list_history(
    db: AsyncSession,
    *,
    shop_id: UUID,
    base_currency: str = "KRW",
    quote_currency: str = "VND",
    limit: int = 50,
) -> list[FxRate]:
    """Return FX rate history, most recent first."""
    result = await db.execute(
        select(FxRate)
        .where(FxRate.shop_id == shop_id)
        .where(FxRate.base_currency == base_currency)
        .where(FxRate.quote_currency == quote_currency)
        .order_by(FxRate.effective_from.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def set_new_rate(
    db: AsyncSession,
    *,
    shop_id: UUID,
    rate: Decimal,
    base_currency: str = "KRW",
    quote_currency: str = "VND",
    source: str = "manual",
    notes: str | None = None,
) -> FxRate:
    """Close the current rate and open a new one. Atomic via single transaction.

    Caller must commit. Idempotency note: calling twice in succession creates
    two rate periods of length 0 for the prior rate, which is harmless but ugly.
    Frontend should debounce.
    """
    if rate <= 0:
        raise ApiError(400, "invalid_rate", "FX rate must be positive")

    now = datetime.now(timezone.utc)

    # Step 1: close existing current rate (if any)
    await db.execute(
        update(FxRate)
        .where(FxRate.shop_id == shop_id)
        .where(FxRate.base_currency == base_currency)
        .where(FxRate.quote_currency == quote_currency)
        .where(FxRate.effective_to.is_(None))
        .values(effective_to=now)
    )

    # Step 2: insert new current rate
    new_rate = FxRate(
        shop_id=shop_id,
        base_currency=base_currency,
        quote_currency=quote_currency,
        rate=rate,
        effective_from=now,
        effective_to=None,
        source=source,
        notes=notes,
    )
    db.add(new_rate)
    await db.flush()
    return new_rate
