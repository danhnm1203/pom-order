from datetime import date, datetime
from decimal import Decimal
from enum import Enum as PyEnum
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OrderStatus(str, PyEnum):
    PENDING = "pending"
    ORDERED = "ordered"
    IN_TRANSIT = "in_transit"
    ARRIVED = "arrived"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    PROBLEM = "problem"
    CANCELLED = "cancelled"


class ShipmentStatus(str, PyEnum):
    PREPARING = "preparing"
    SHIPPED = "shipped"
    IN_TRANSIT = "in_transit"
    ARRIVED = "arrived"
    DISTRIBUTED = "distributed"


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    shop_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str | None] = mapped_column(String)
    status: Mapped[ShipmentStatus] = mapped_column(
        Enum(
            ShipmentStatus,
            name="shipment_status",
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ShipmentStatus.PREPARING,
    )
    carrier: Mapped[str | None] = mapped_column(String)
    tracking_number: Mapped[str | None] = mapped_column(String)
    total_international_cost_vnd: Mapped[Decimal | None] = mapped_column(Numeric(18, 0))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    shop_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
    )
    public_token: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), unique=True, nullable=False, default=uuid4
    )
    customer_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("customers.id", ondelete="RESTRICT")
    )
    address_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("addresses.id")
    )
    shipment_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("shipments.id")
    )
    status: Mapped[OrderStatus] = mapped_column(
        Enum(
            OrderStatus,
            name="order_status",
            create_type=False,
            # Tell SQLAlchemy to serialize using `.value` ("cancelled") instead
            # of `.name` ("CANCELLED") so it matches the Postgres enum values.
            values_callable=lambda x: [e.value for e in x],
        ),
        default=OrderStatus.PENDING,
    )
    fx_rate_krw_to_vnd: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    korean_shipping_krw: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    international_shipping_vnd: Mapped[Decimal] = mapped_column(Numeric(18, 0), default=Decimal("0"))
    notes: Mapped[str | None] = mapped_column(String)
    # Free text + recommended controlled vocabulary. App expects:
    #   out_of_stock | wrong_variant | ship_delay | customer_cancel | damaged | customs_hold | other
    # Set when status='problem'. Null otherwise.
    problem_reason: Mapped[str | None] = mapped_column(String)
    # Cached shortened public URL (from adurl.io or similar). Populated on demand
    # when user clicks "share". Stable across requests so customers can re-use
    # the same short link.
    public_short_url: Mapped[str | None] = mapped_column(String)
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expected_arrival_date: Mapped[date | None] = mapped_column(Date)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    # Lazy by default — only loaded when explicitly selectinload'ed by callers
    # (e.g., list/detail endpoints). Avoids N+1 in places that don't need it.
    customer: Mapped["Customer | None"] = relationship(  # noqa: F821 — resolved at runtime
        "Customer",
        foreign_keys=[customer_id],
        lazy="select",
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        CheckConstraint("unit_cost_krw >= 0", name="ck_order_items_cost_nonneg"),
        CheckConstraint("unit_sale_price_vnd >= 0", name="ck_order_items_sale_nonneg"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("products.id")
    )
    variant_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("product_variants.id")
    )
    product_name_snapshot: Mapped[str] = mapped_column(String, nullable=False)
    product_url_snapshot: Mapped[str | None] = mapped_column(String)
    brand_name_snapshot: Mapped[str | None] = mapped_column(String)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_cost_krw: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    unit_sale_price_vnd: Mapped[Decimal] = mapped_column(Numeric(18, 0), nullable=False)
    notes: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped[Order] = relationship(back_populates="items")
