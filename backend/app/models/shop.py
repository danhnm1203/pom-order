from datetime import datetime
from enum import Enum as PyEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ShopRole(str, PyEnum):
    OWNER = "owner"
    ADMIN = "admin"
    STAFF = "staff"


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    # Public lookup-tool config: markup_pct, buying_fee_vnd, weight_fee_vnd,
    # zalo_phone, zalo_message_template. Stored as JSONB so new tunables can
    # be added without a migration.
    lookup_config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["ShopMember"]] = relationship(back_populates="shop", cascade="all, delete-orphan")


class ShopMember(Base):
    __tablename__ = "shop_members"
    __table_args__ = (UniqueConstraint("shop_id", "user_id"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    shop_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    role: Mapped[ShopRole] = mapped_column(
        Enum(
            ShopRole,
            name="shop_role",
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ShopRole.STAFF,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    shop: Mapped[Shop] = relationship(back_populates="members")
