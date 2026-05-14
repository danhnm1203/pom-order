"""Customer CRUD endpoints. All require authenticated user with shop membership."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_current_user_id, get_db
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from app.services import customer as customer_service


router = APIRouter()


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
    _user_id: UUID = Depends(get_current_user_id),
) -> CustomerResponse:
    customer = await customer_service.create_customer(db, shop_id=shop_id, data=data)
    return CustomerResponse.model_validate(customer)


@router.get("", response_model=list[CustomerResponse])
async def list_customers(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> list[CustomerResponse]:
    customers = await customer_service.list_customers(
        db, shop_id=shop_id, limit=limit, offset=offset, search=search
    )
    return [CustomerResponse.model_validate(c) for c in customers]


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> CustomerResponse:
    customer = await customer_service.get_customer(db, shop_id=shop_id, customer_id=customer_id)
    return CustomerResponse.model_validate(customer)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: UUID,
    data: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> CustomerResponse:
    customer = await customer_service.update_customer(
        db, shop_id=shop_id, customer_id=customer_id, data=data
    )
    return CustomerResponse.model_validate(customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> None:
    await customer_service.soft_delete_customer(db, shop_id=shop_id, customer_id=customer_id)
