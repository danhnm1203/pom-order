"""Product catalog endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_current_user_id, get_db
from app.schemas.catalog import (
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    ProductWithStats,
)
from app.services import product as product_service


router = APIRouter()


@router.get("", response_model=list[ProductWithStats])
async def list_products(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> list[ProductWithStats]:
    return await product_service.list_products_with_stats(
        db, shop_id=shop_id, search=search, limit=limit, offset=offset
    )


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
    _user_id: UUID = Depends(get_current_user_id),
) -> ProductResponse:
    return await product_service.create_product(db, shop_id=shop_id, data=data)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> ProductResponse:
    return await product_service.get_product(db, shop_id=shop_id, product_id=product_id)


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> ProductResponse:
    return await product_service.update_product(
        db, shop_id=shop_id, product_id=product_id, data=data
    )
