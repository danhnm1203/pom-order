"""FX rate management endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_db
from app.schemas.fx_rate import FxRateCreate, FxRateResponse
from app.services import fx_rate as fx_rate_service


router = APIRouter()


@router.get("/current", response_model=FxRateResponse)
async def get_current_fx_rate(
    base: str = Query(default="KRW"),
    quote: str = Query(default="VND"),
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> FxRateResponse:
    rate = await fx_rate_service.get_current_rate(
        db, shop_id=shop_id, base_currency=base, quote_currency=quote
    )
    return FxRateResponse.model_validate(rate)


@router.get("", response_model=list[FxRateResponse])
async def list_fx_history(
    base: str = Query(default="KRW"),
    quote: str = Query(default="VND"),
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> list[FxRateResponse]:
    rates = await fx_rate_service.list_history(
        db, shop_id=shop_id, base_currency=base, quote_currency=quote, limit=limit
    )
    return [FxRateResponse.model_validate(r) for r in rates]


@router.post("", response_model=FxRateResponse, status_code=status.HTTP_201_CREATED)
async def set_fx_rate(
    data: FxRateCreate,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> FxRateResponse:
    rate = await fx_rate_service.set_new_rate(
        db,
        shop_id=shop_id,
        rate=data.rate,
        base_currency=data.base_currency,
        quote_currency=data.quote_currency,
        source=data.source or "manual",
        notes=data.notes,
    )
    return FxRateResponse.model_validate(rate)
