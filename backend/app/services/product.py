"""Product catalog service.

Brand resolution: when a product is created/updated with `brand_name`, the
service looks up an existing Brand row (shop_id + name) or inserts a new one.
This avoids forcing the operator to manage brands separately.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.exceptions import ApiError
from app.models.catalog import Brand, Product
from app.models.order import Order, OrderItem, OrderStatus
from app.schemas.catalog import (
    ProductCreate,
    ProductResponse,
    ProductStats,
    ProductUpdate,
    ProductWithStats,
)


# Status sets — single source of truth for stats classification.
# "Already placed with Korea" = purchased and every downstream state.
_ALREADY_ORDERED_STATUSES = (
    OrderStatus.PURCHASED,
    OrderStatus.AT_KR_WAREHOUSE,
    OrderStatus.AT_VN_WAREHOUSE,
    OrderStatus.RECEIVED_BY_OWNER,
    OrderStatus.SHIPPING_TO_CUSTOMER,
    OrderStatus.CUSTOMER_RECEIVED,
)
# "Delivered to customer" = customer has the goods in hand.
_DELIVERED_STATUSES = (OrderStatus.CUSTOMER_RECEIVED,)


async def _resolve_or_create_brand(
    db: AsyncSession, *, shop_id: UUID, brand_name: str | None
) -> UUID | None:
    """Find brand by (shop_id, name) or insert. Returns brand_id (or None if no name)."""
    if not brand_name or not brand_name.strip():
        return None
    name = brand_name.strip()
    existing = await db.execute(
        select(Brand.id).where(Brand.shop_id == shop_id).where(Brand.name == name)
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        return found
    brand = Brand(shop_id=shop_id, name=name)
    db.add(brand)
    await db.flush()
    return brand.id


async def create_product(
    db: AsyncSession, *, shop_id: UUID, data: ProductCreate
) -> ProductResponse:
    brand_id = await _resolve_or_create_brand(
        db, shop_id=shop_id, brand_name=data.brand_name
    )
    product = Product(
        shop_id=shop_id,
        brand_id=brand_id,
        name=data.name.strip(),
        name_kr=data.name_kr.strip() if data.name_kr else None,
        url=data.url.strip() if data.url else None,
        base_price_krw=data.base_price_krw,
    )
    db.add(product)
    await db.flush()
    return await get_product(db, shop_id=shop_id, product_id=product.id)


async def get_product(
    db: AsyncSession, *, shop_id: UUID, product_id: UUID
) -> ProductResponse:
    result = await db.execute(
        select(Product, Brand.name.label("brand_name"))
        .outerjoin(Brand, Brand.id == Product.brand_id)
        .where(Product.id == product_id)
        .where(Product.shop_id == shop_id)
    )
    row = result.first()
    if row is None:
        raise ApiError(404, "product_not_found", "Sản phẩm không tồn tại")
    product, brand_name = row
    return ProductResponse(
        id=product.id,
        shop_id=product.shop_id,
        brand_id=product.brand_id,
        brand_name=brand_name,
        name=product.name,
        name_kr=product.name_kr,
        url=product.url,
        base_price_krw=product.base_price_krw,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


async def update_product(
    db: AsyncSession, *, shop_id: UUID, product_id: UUID, data: ProductUpdate
) -> ProductResponse:
    result = await db.execute(
        select(Product).where(Product.id == product_id).where(Product.shop_id == shop_id)
    )
    product = result.scalar_one_or_none()
    if product is None:
        raise ApiError(404, "product_not_found", "Sản phẩm không tồn tại")

    if data.name is not None:
        product.name = data.name.strip()
    if data.name_kr is not None:
        product.name_kr = data.name_kr.strip() or None
    if data.url is not None:
        product.url = data.url.strip() or None
    if data.base_price_krw is not None:
        product.base_price_krw = data.base_price_krw
    if data.brand_name is not None:
        product.brand_id = await _resolve_or_create_brand(
            db, shop_id=shop_id, brand_name=data.brand_name
        )

    product.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return await get_product(db, shop_id=shop_id, product_id=product.id)


async def find_or_create_for_snapshot(
    db: AsyncSession,
    *,
    shop_id: UUID,
    name: str,
    brand_name: str | None,
    url: str | None,
    base_price_krw: Decimal | None,
) -> UUID:
    """Resolve a Product for an order-item snapshot, creating if needed.

    Match precedence (URL is most reliable — scraped items share canonical URLs):
      1. URL match (case-sensitive, within shop)
      2. (lower(name) + lower(brand_name)) match within shop
      3. Otherwise create a new Product

    Returns the resolved/created product_id. Caller is responsible for flushing
    the session if it relies on the row being queryable.
    """
    clean_name = name.strip()
    clean_url = url.strip() if url else None
    clean_brand = brand_name.strip() if brand_name else None

    if clean_url:
        existing = await db.execute(
            select(Product.id)
            .where(Product.shop_id == shop_id)
            .where(Product.url == clean_url)
            .limit(1)
        )
        found = existing.scalar_one_or_none()
        if found is not None:
            return found

    if clean_name:
        # Match name (case-insensitive). If brand is provided, restrict to that
        # brand to avoid colliding with same-named items from different brands.
        from sqlalchemy import func as sa_func

        name_query = (
            select(Product.id)
            .where(Product.shop_id == shop_id)
            .where(sa_func.lower(Product.name) == clean_name.lower())
        )
        if clean_brand:
            name_query = name_query.join(
                Brand, Brand.id == Product.brand_id
            ).where(sa_func.lower(Brand.name) == clean_brand.lower())
        else:
            name_query = name_query.where(Product.brand_id.is_(None))

        existing = await db.execute(name_query.limit(1))
        found = existing.scalar_one_or_none()
        if found is not None:
            return found

    brand_id = await _resolve_or_create_brand(
        db, shop_id=shop_id, brand_name=clean_brand
    )
    product = Product(
        shop_id=shop_id,
        brand_id=brand_id,
        name=clean_name,
        url=clean_url,
        base_price_krw=base_price_krw,
    )
    db.add(product)
    await db.flush()
    return product.id


async def list_products_with_stats(
    db: AsyncSession,
    *,
    shop_id: UUID,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ProductWithStats]:
    """List products + per-product order aggregates.

    Stats are computed via a single LEFT JOIN order_items -> orders, with
    conditional SUMs. LEFT JOIN ensures products without any orders still show
    up with zero stats. Cancelled orders and soft-deleted orders are excluded
    from every aggregate.
    """
    o = aliased(Order)
    oi = aliased(OrderItem)

    qty_when = lambda statuses: func.coalesce(  # noqa: E731
        func.sum(
            case(
                (
                    (o.status.in_(statuses))
                    & (o.deleted_at.is_(None)),
                    oi.quantity,
                ),
                else_=0,
            )
        ),
        0,
    )

    # "Total" = not cancelled (and not soft-deleted). Computed similarly.
    total_when = func.coalesce(
        func.sum(
            case(
                (
                    (o.status != OrderStatus.CANCELLED)
                    & (o.deleted_at.is_(None)),
                    oi.quantity,
                ),
                else_=0,
            )
        ),
        0,
    )

    query = (
        select(
            Product,
            Brand.name.label("brand_name"),
            total_when.label("total_qty"),
            qty_when(_ALREADY_ORDERED_STATUSES).label("ordered_qty"),
            qty_when(_DELIVERED_STATUSES).label("delivered_qty"),
        )
        .outerjoin(Brand, Brand.id == Product.brand_id)
        .outerjoin(oi, oi.product_id == Product.id)
        .outerjoin(o, o.id == oi.order_id)
        .where(Product.shop_id == shop_id)
        .group_by(Product.id, Brand.name)
        .order_by(Product.name.asc())
        .limit(limit)
        .offset(offset)
    )

    if search:
        like = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Product.name).like(like),
                func.lower(func.coalesce(Product.name_kr, "")).like(like),
                func.lower(func.coalesce(Brand.name, "")).like(like),
            )
        )

    result = await db.execute(query)
    out: list[ProductWithStats] = []
    for row in result.all():
        product, brand_name, total_qty, ordered_qty, delivered_qty = row
        total = Decimal(total_qty or 0)
        ordered = Decimal(ordered_qty or 0)
        delivered = Decimal(delivered_qty or 0)
        out.append(
            ProductWithStats(
                id=product.id,
                shop_id=product.shop_id,
                brand_id=product.brand_id,
                brand_name=brand_name,
                name=product.name,
                name_kr=product.name_kr,
                url=product.url,
                base_price_krw=product.base_price_krw,
                created_at=product.created_at,
                updated_at=product.updated_at,
                stats=ProductStats(
                    total_qty=total,
                    ordered_qty=ordered,
                    delivered_qty=delivered,
                    pending_qty=total - ordered,
                ),
            )
        )
    return out
