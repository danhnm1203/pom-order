"""Order-item list endpoint — purchase-list / to-order view.

One row per order_item, joined with the parent order so the UI can show the
order status (pending = cần đặt với Hàn, ordered/in_transit/... = đã đặt) and
the customer name in a single flat list.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_shop_id, get_db
from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus


router = APIRouter()


class OrderItemListRow(BaseModel):
    """Flat row for the purchase-list view."""

    model_config = ConfigDict(from_attributes=True)

    item_id: UUID
    order_id: UUID
    order_status: OrderStatus
    order_created_at: datetime
    product_id: UUID | None
    product_name: str
    product_url: str | None
    brand_name: str | None
    quantity: str
    notes: str | None
    customer_id: UUID | None
    customer_name: str | None


@router.get("", response_model=list[OrderItemListRow])
async def list_order_items(
    status: OrderStatus | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    shop_id: UUID = Depends(get_current_shop_id),
) -> list[OrderItemListRow]:
    """List every order_item in the shop with parent order + customer context.

    Excludes soft-deleted orders. `status` filter is optional — when omitted,
    returns items from every status (caller filters in UI). Ordered by parent
    order created_at descending so newest orders surface first.
    """
    query = (
        select(OrderItem, Order, Customer)
        .join(Order, Order.id == OrderItem.order_id)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .order_by(Order.created_at.desc(), OrderItem.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    if status is not None:
        query = query.where(Order.status == status)

    result = await db.execute(query)
    rows: list[OrderItemListRow] = []
    for item, order, customer in result.all():
        rows.append(
            OrderItemListRow(
                item_id=item.id,
                order_id=order.id,
                order_status=order.status,
                order_created_at=order.created_at,
                product_id=item.product_id,
                product_name=item.product_name_snapshot,
                product_url=item.product_url_snapshot,
                brand_name=item.brand_name_snapshot,
                quantity=str(item.quantity),
                notes=item.notes,
                customer_id=customer.id if customer else None,
                customer_name=customer.name if customer else None,
            )
        )
    return rows
