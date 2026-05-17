"""Customer CRUD service."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models.customer import Address, Customer, CustomerContact
from app.schemas.customer import CustomerCreate, CustomerUpdate


async def create_customer(
    db: AsyncSession,
    *,
    shop_id: UUID,
    data: CustomerCreate,
) -> Customer:
    """Insert customer + contacts + optional default address in one transaction."""
    customer = Customer(
        shop_id=shop_id,
        name=data.name.strip(),
        notes=data.notes,
    )
    db.add(customer)
    await db.flush()  # populate customer.id

    for contact in data.contacts:
        db.add(
            CustomerContact(
                customer_id=customer.id,
                channel=contact.channel.strip().lower(),
                value=contact.value.strip(),
                is_primary=contact.is_primary,
            )
        )

    if data.address:
        db.add(
            Address(
                customer_id=customer.id,
                street=data.address.strip(),
                is_default=True,
            )
        )

    await db.flush()
    # Re-fetch with relationships eagerly loaded
    return await get_customer(db, shop_id=shop_id, customer_id=customer.id)


async def get_customer(
    db: AsyncSession,
    *,
    shop_id: UUID,
    customer_id: UUID,
) -> Customer:
    """Return customer with contacts + addresses, scoped to shop. Raises 404."""
    result = await db.execute(
        select(Customer)
        .where(Customer.id == customer_id)
        .where(Customer.shop_id == shop_id)
        .where(Customer.deleted_at.is_(None))
        .options(
            selectinload(Customer.contacts),
            selectinload(Customer.addresses),
        )
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise ApiError(404, "customer_not_found", "Khách hàng không tồn tại")
    return customer


async def list_customers(
    db: AsyncSession,
    *,
    shop_id: UUID,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
) -> list[Customer]:
    """List customers (active only), optionally filtered by name."""
    query = (
        select(Customer)
        .where(Customer.shop_id == shop_id)
        .where(Customer.deleted_at.is_(None))
        .options(selectinload(Customer.contacts))
        .order_by(Customer.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if search:
        query = query.where(Customer.name.ilike(f"%{search}%"))

    result = await db.execute(query)
    return list(result.scalars().all())


async def update_customer(
    db: AsyncSession,
    *,
    shop_id: UUID,
    customer_id: UUID,
    data: CustomerUpdate,
) -> Customer:
    """Update mutable customer fields. Returns updated customer.

    If `data.address` is set, replaces the customer's default address
    (or creates one if none exists).
    """
    customer = await get_customer(db, shop_id=shop_id, customer_id=customer_id)

    if data.name is not None:
        customer.name = data.name.strip()
    if data.notes is not None:
        customer.notes = data.notes

    if data.address is not None:
        existing_default = next(
            (a for a in customer.addresses if a.is_default), None
        )
        if existing_default is not None:
            existing_default.street = data.address.strip()
        else:
            db.add(
                Address(
                    customer_id=customer.id,
                    street=data.address.strip(),
                    is_default=True,
                )
            )

    customer.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return await get_customer(db, shop_id=shop_id, customer_id=customer.id)


async def soft_delete_customer(
    db: AsyncSession,
    *,
    shop_id: UUID,
    customer_id: UUID,
) -> None:
    """Soft delete via deleted_at timestamp. Active orders block delete."""
    customer = await get_customer(db, shop_id=shop_id, customer_id=customer_id)

    # Guard: do not delete a customer with active (non-cancelled) orders
    from app.models.order import Order, OrderStatus  # local to avoid circular

    active_orders = await db.execute(
        select(Order.id)
        .where(Order.customer_id == customer.id)
        .where(Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.COMPLETED]))
        .limit(1)
    )
    if active_orders.scalar_one_or_none() is not None:
        raise ApiError(
            409,
            "customer_has_active_orders",
            "Không thể xóa khách hàng có đơn đang hoạt động",
        )

    customer.deleted_at = datetime.now(timezone.utc)
    await db.flush()
