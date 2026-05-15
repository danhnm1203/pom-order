"""Authenticated admin endpoints for shop-level configuration."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_db
from app.schemas.lookup import LookupConfig, LookupConfigResponse
from app.services.lookup import get_shop_lookup_config, update_shop_lookup_config


router = APIRouter()


@router.get("/lookup", response_model=LookupConfigResponse)
async def get_lookup_config(
    db: AsyncSession = Depends(get_db),
    _: UUID = Depends(get_current_shop_id),  # noqa: ARG001 — gates the endpoint
) -> LookupConfig:
    _, config = await get_shop_lookup_config(db)
    return config


@router.put("/lookup", response_model=LookupConfigResponse)
async def put_lookup_config(
    body: LookupConfig,
    db: AsyncSession = Depends(get_db),
    _: UUID = Depends(get_current_shop_id),  # noqa: ARG001 — gates the endpoint
) -> LookupConfig:
    return await update_shop_lookup_config(db, new_config=body)
