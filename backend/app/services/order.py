"""Order service — create, query, status transition.

Critical flow on creation:
  1. Resolve current FX rate snapshot (or use caller-provided)
  2. Validate customer belongs to shop
  3. INSERT order + items in single transaction
  4. Audit log entry: action='created'

Status update flow:
  1. Validate transition via order_status.validate_transition
  2. UPDATE order row
  3. Audit log entry: action='status_changed' with from/to
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models.customer import Customer
from app.models.order import Order, OrderItem, OrderStatus
from app.schemas.order import OrderCreate
from app.services.audit import log_audit
from app.services.fx_rate import get_current_rate
from app.services.order_calculations import OrderTotals, compute_order_totals
from app.services.order_status import validate_transition


async def create_order(
    db: AsyncSession,
    *,
    shop_id: UUID,
    actor_id: UUID,
    data: OrderCreate,
) -> Order:
    """Create an order with line items. FX rate is snapshot at creation time.

    If caller did not provide `fx_rate_krw_to_vnd` (None or 0), fetch the current
    rate from `fx_rates` table. This is the recommended path; passing an explicit
    rate is for special cases (manual override).
    """
    # Resolve FX rate: caller value wins; otherwise fetch current
    fx_rate = data.fx_rate_krw_to_vnd
    if fx_rate is None or fx_rate <= 0:
        current = await get_current_rate(db, shop_id=shop_id)
        fx_rate = current.rate

    # Validate customer belongs to shop (if specified)
    if data.customer_id is not None:
        from app.models.customer import Customer  # local to avoid circular

        cust_check = await db.execute(
            select(Customer.id)
            .where(Customer.id == data.customer_id)
            .where(Customer.shop_id == shop_id)
            .where(Customer.deleted_at.is_(None))
        )
        if cust_check.scalar_one_or_none() is None:
            raise ApiError(404, "customer_not_found", "Khách hàng không thuộc shop này")

    order = Order(
        shop_id=shop_id,
        customer_id=data.customer_id,
        address_id=data.address_id,
        status=OrderStatus.ORDER_PLACED,
        fx_rate_krw_to_vnd=fx_rate,
        korean_shipping_krw=data.korean_shipping_krw,
        international_shipping_vnd=data.international_shipping_vnd,
        notes=data.notes,
        expected_arrival_date=data.expected_arrival_date,
    )
    db.add(order)
    await db.flush()  # populate order.id

    # Auto-link every item to a Product row so the catalog + stats stay in sync.
    # If the operator didn't pick one explicitly, find-or-create by URL/name+brand.
    from app.services.product import find_or_create_for_snapshot

    for item_data in data.items:
        resolved_product_id = item_data.product_id
        if resolved_product_id is None:
            resolved_product_id = await find_or_create_for_snapshot(
                db,
                shop_id=shop_id,
                name=item_data.product_name_snapshot,
                brand_name=item_data.brand_name_snapshot,
                url=item_data.product_url_snapshot,
                base_price_krw=item_data.unit_cost_krw,
            )

        db.add(
            OrderItem(
                order_id=order.id,
                product_id=resolved_product_id,
                variant_id=item_data.variant_id,
                product_name_snapshot=item_data.product_name_snapshot,
                product_url_snapshot=item_data.product_url_snapshot,
                brand_name_snapshot=item_data.brand_name_snapshot,
                quantity=item_data.quantity,
                unit_cost_krw=item_data.unit_cost_krw,
                unit_sale_price_vnd=item_data.unit_sale_price_vnd,
                notes=item_data.notes,
            )
        )

    await log_audit(
        db,
        shop_id=shop_id,
        entity_type="order",
        entity_id=order.id,
        action="created",
        actor_id=actor_id,
        changes={"item_count": len(data.items), "fx_rate": str(fx_rate)},
    )

    await db.flush()
    return await get_order(db, shop_id=shop_id, order_id=order.id)


async def _validate_customer_in_shop(
    db: AsyncSession, *, shop_id: UUID, customer_id: UUID
) -> None:
    """Raise 404 if `customer_id` doesn't belong to `shop_id` (or is soft-deleted)."""
    from app.models.customer import Customer  # local to avoid circular

    res = await db.execute(
        select(Customer.id)
        .where(Customer.id == customer_id)
        .where(Customer.shop_id == shop_id)
        .where(Customer.deleted_at.is_(None))
    )
    if res.scalar_one_or_none() is None:
        raise ApiError(404, "customer_not_found", "Khách hàng không thuộc shop này")


def _apply_order_scalar_updates(order: Order, data: "OrderUpdate") -> dict:
    """Apply non-item field updates onto `order`. Returns an audit-changes dict
    capturing every field that actually changed."""
    changes: dict = {}
    # (data_attr, order_attr, audit_key — None to skip audit logging for this field)
    fields: list[tuple[str, str, str | None]] = [
        ("customer_id", "customer_id", "customer_id"),
        ("address_id", "address_id", None),
        ("fx_rate_krw_to_vnd", "fx_rate_krw_to_vnd", "fx_rate"),
        ("korean_shipping_krw", "korean_shipping_krw", None),
        ("international_shipping_vnd", "international_shipping_vnd", None),
        ("expected_arrival_date", "expected_arrival_date", None),
        ("notes", "notes", None),
    ]
    for data_attr, order_attr, audit_key in fields:
        new = getattr(data, data_attr)
        if new is None:
            continue
        old = getattr(order, order_attr)
        if new == old:
            continue
        if audit_key:
            changes[audit_key] = {"from": str(old), "to": str(new)}
        setattr(order, order_attr, new)
    return changes


async def update_order(
    db: AsyncSession,
    *,
    shop_id: UUID,
    actor_id: UUID,
    order_id: UUID,
    data: "OrderUpdate",
) -> Order:
    """Partial update of an order. Items (when present) REPLACE the existing list.

    Status + tracking_number live on a separate endpoint — operator workflow
    is "fix typos" here vs "advance lifecycle" there.
    """
    order = await get_order(db, shop_id=shop_id, order_id=order_id)

    if data.customer_id is not None and data.customer_id != order.customer_id:
        await _validate_customer_in_shop(db, shop_id=shop_id, customer_id=data.customer_id)

    changes = _apply_order_scalar_updates(order, data)

    if data.items is not None:
        await _replace_order_items(db, shop_id=shop_id, order=order, items=data.items)
        changes["item_count"] = len(data.items)

    order.updated_at = datetime.now(timezone.utc)
    await db.flush()

    if changes:
        await log_audit(
            db,
            shop_id=shop_id,
            entity_type="order",
            entity_id=order.id,
            action="updated",
            actor_id=actor_id,
            changes=changes,
        )

    return await get_order(db, shop_id=shop_id, order_id=order.id)


async def _replace_order_items(
    db: AsyncSession,
    *,
    shop_id: UUID,
    order: Order,
    items: list,
) -> None:
    """Delete every existing item and re-insert from `items`.

    Each new item runs through find_or_create_for_snapshot so the product
    catalog + stats stay in sync (same path as order creation).
    """
    from app.services.product import find_or_create_for_snapshot

    for old_item in order.items:
        await db.delete(old_item)
    await db.flush()

    for item_data in items:
        resolved_product_id = item_data.product_id
        if resolved_product_id is None:
            resolved_product_id = await find_or_create_for_snapshot(
                db,
                shop_id=shop_id,
                name=item_data.product_name_snapshot,
                brand_name=item_data.brand_name_snapshot,
                url=item_data.product_url_snapshot,
                base_price_krw=item_data.unit_cost_krw,
            )
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=resolved_product_id,
                variant_id=item_data.variant_id,
                product_name_snapshot=item_data.product_name_snapshot,
                product_url_snapshot=item_data.product_url_snapshot,
                brand_name_snapshot=item_data.brand_name_snapshot,
                quantity=item_data.quantity,
                unit_cost_krw=item_data.unit_cost_krw,
                unit_sale_price_vnd=item_data.unit_sale_price_vnd,
                notes=item_data.notes,
            )
        )


async def get_order(
    db: AsyncSession,
    *,
    shop_id: UUID,
    order_id: UUID,
) -> Order:
    """Fetch order with items + customer + contacts eager-loaded. Raises 404 if not found."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .options(
            selectinload(Order.items),
            selectinload(Order.customer).selectinload(Customer.contacts),
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise ApiError(404, "order_not_found", "Đơn hàng không tồn tại")
    return order


async def list_orders(
    db: AsyncSession,
    *,
    shop_id: UUID,
    status: OrderStatus | None = None,
    customer_id: UUID | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Order]:
    """List orders with filters. Customer + contacts eager-loaded for the list view.

    `search` does case-insensitive partial match across customer name + item brand
    + item product name snapshot. Subquery joins are used to avoid duplicate orders
    when multiple items match.
    """
    from sqlalchemy import or_

    # Eager-load customer.contacts too: OrderResponse → CustomerListItem schema
    # includes `contacts`, so Pydantic accesses the attribute during validation.
    # Without selectinload it triggers async lazy-load outside a greenlet (500).
    # Cost: one extra round trip per list page (selectinload, not N+1).
    query = (
        select(Order)
        .where(Order.shop_id == shop_id)
        .where(Order.deleted_at.is_(None))
        .options(
            selectinload(Order.items),
            selectinload(Order.customer).selectinload(Customer.contacts),
        )
        .order_by(Order.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status is not None:
        query = query.where(Order.status == status)
    if customer_id is not None:
        query = query.where(Order.customer_id == customer_id)

    if search:
        term = f"%{search.strip()}%"
        # Match if customer name OR any item's brand/product matches.
        # Use EXISTS subqueries to avoid distinct/duplicate rows.
        from app.models.order import OrderItem
        from sqlalchemy import exists

        item_match = (
            select(OrderItem.id)
            .where(OrderItem.order_id == Order.id)
            .where(
                or_(
                    OrderItem.brand_name_snapshot.ilike(term),
                    OrderItem.product_name_snapshot.ilike(term),
                )
            )
        )
        customer_match = (
            select(Customer.id)
            .where(Customer.id == Order.customer_id)
            .where(Customer.name.ilike(term))
        )
        query = query.where(or_(exists(item_match), exists(customer_match)))

    result = await db.execute(query)
    return list(result.scalars().all())


async def update_status(
    db: AsyncSession,
    *,
    shop_id: UUID,
    order_id: UUID,
    new_status: OrderStatus,
    actor_id: UUID,
    problem_reason: str | None = None,
    tracking_number: str | None = None,
) -> Order:
    """Transition order status with state machine validation + audit log.

    If new_status == 'problem', `problem_reason` must be provided.
    If new_status == 'shipping_to_customer', `tracking_number` is required
    (operator must enter the carrier tracking number at that step).
    """
    from app.exceptions import ApiError  # local to avoid circular

    order = await get_order(db, shop_id=shop_id, order_id=order_id)

    old_status = order.status
    validate_transition(old_status, new_status)

    # Enforce problem_reason when entering 'problem' status
    if new_status == OrderStatus.PROBLEM and not problem_reason:
        raise ApiError(
            422,
            "problem_reason_required",
            "Cần điền lý do khi chuyển sang trạng thái 'problem'",
        )

    # Tracking number required when entering shipping_to_customer (operator
    # always knows the carrier code before clicking the button — enforcing it
    # here prevents accidentally leaving customers without a way to track).
    if new_status == OrderStatus.SHIPPING_TO_CUSTOMER:
        chosen_tracking = (tracking_number or order.tracking_number or "").strip()
        if not chosen_tracking:
            raise ApiError(
                422,
                "tracking_number_required",
                "Cần điền mã vận đơn khi chuyển sang trạng thái 'vận chuyển cho khách'",
            )
        order.tracking_number = chosen_tracking
    elif tracking_number is not None:
        # Allow setting/clearing tracking# even when not entering shipping state
        # (e.g., correction). Empty string clears.
        order.tracking_number = tracking_number.strip() or None

    order.status = new_status
    order.updated_at = datetime.now(timezone.utc)

    # Set / clear problem_reason
    if new_status == OrderStatus.PROBLEM:
        order.problem_reason = problem_reason
    # Note: we keep the old problem_reason if transitioning OUT of problem,
    # for historical audit. To clear, app can PATCH separately.

    # Stamp ordered_at when first reaching the "purchased with Korea" step.
    if new_status == OrderStatus.PURCHASED and order.ordered_at is None:
        order.ordered_at = datetime.now(timezone.utc)

    changes: dict = {"from": old_status.value, "to": new_status.value}
    if problem_reason:
        changes["problem_reason"] = problem_reason
    if tracking_number:
        changes["tracking_number"] = tracking_number

    await log_audit(
        db,
        shop_id=shop_id,
        entity_type="order",
        entity_id=order.id,
        action="status_changed",
        actor_id=actor_id,
        changes=changes,
    )

    await db.flush()
    return order


def compute_totals_for_order(
    order: Order, payments: list | None = None
) -> OrderTotals:
    """Convenience wrapper around compute_order_totals using an ORM order."""
    return compute_order_totals(
        items=list(order.items),
        payments=payments or [],
        fx_rate_krw_to_vnd=order.fx_rate_krw_to_vnd,
        korean_shipping_krw=order.korean_shipping_krw,
        international_shipping_vnd=order.international_shipping_vnd,
    )


def build_public_long_url(order: Order) -> str:
    """Build the canonical long URL pointing at the public order page."""
    from app.config import settings

    base = settings.public_base_url.rstrip("/")
    return f"{base}/o/{order.public_token}"


async def get_or_create_short_link(
    db: AsyncSession,
    *,
    shop_id: UUID,
    order_id: UUID,
) -> tuple[str, str | None, bool, str | None]:
    """Return (long_url, short_url, is_cached, error_reason).

    Idempotent: cached `order.public_short_url` returned as-is. On miss, call
    shortener; on success persist; on failure, surface the human-readable reason
    so the UI can show a useful message.
    """
    from app.services.url_shortener import shorten_url

    order = await get_order(db, shop_id=shop_id, order_id=order_id)
    long_url = build_public_long_url(order)

    if order.public_short_url:
        return long_url, order.public_short_url, True, None

    short, error_reason = await shorten_url(long_url)
    if short:
        order.public_short_url = short
        await db.flush()
    return long_url, short, False, error_reason
