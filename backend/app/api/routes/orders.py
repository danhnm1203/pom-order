"""Order CRUD + status transition endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_current_user_id, get_db
from app.models.order import Order, OrderStatus
from app.models.payment import Payment
from app.schemas.common import OrderTotalsResponse
from app.schemas.order import OrderCreate, OrderResponse, OrderStatusUpdate
from app.services import order as order_service
from app.services import payment as payment_service


router = APIRouter()


def _to_response(order: Order, payments: list[Payment]) -> OrderResponse:
    """Build OrderResponse with computed totals attached."""
    totals = order_service.compute_totals_for_order(order, payments)
    response = OrderResponse.model_validate(order)
    response.totals = OrderTotalsResponse(
        total_vnd=totals.total_vnd,
        cost_vnd=totals.cost_vnd,
        profit_vnd=totals.profit_vnd,
        international_shipping_vnd=totals.international_shipping_vnd,
        total_paid_vnd=totals.total_paid_vnd,
        amount_owed_vnd=totals.amount_owed_vnd,
    )
    return response


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
    user_id: UUID = Depends(get_current_user_id),
) -> OrderResponse:
    order = await order_service.create_order(db, shop_id=shop_id, actor_id=user_id, data=data)
    return _to_response(order, payments=[])


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    customer_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> list[OrderResponse]:
    orders = await order_service.list_orders(
        db,
        shop_id=shop_id,
        status=status_filter,
        customer_id=customer_id,
        search=search,
        limit=limit,
        offset=offset,
    )
    # For list view we don't fetch payments per order (N+1). Totals show
    # without total_paid; caller can hit /orders/{id} for full payment math.
    return [_to_response(o, payments=[]) for o in orders]


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> OrderResponse:
    order = await order_service.get_order(db, shop_id=shop_id, order_id=order_id)
    payments = await payment_service.list_payments_for_order(
        db, shop_id=shop_id, order_id=order_id
    )
    return _to_response(order, payments=payments)


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: UUID,
    data: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
    user_id: UUID = Depends(get_current_user_id),
) -> OrderResponse:
    order = await order_service.update_status(
        db,
        shop_id=shop_id,
        order_id=order_id,
        new_status=data.status,
        actor_id=user_id,
        problem_reason=data.problem_reason,
    )
    payments = await payment_service.list_payments_for_order(
        db, shop_id=shop_id, order_id=order_id
    )
    return _to_response(order, payments=payments)
