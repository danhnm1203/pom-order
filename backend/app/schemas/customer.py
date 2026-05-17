from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerContactBase(BaseModel):
    # Free-text channel — operator can name any app ("instagram", "line",
    # "wechat", etc.). The trigger that denormalizes customers.primary_phone
    # only treats channel='phone' specially; everything else is just stored.
    channel: Annotated[str, Field(min_length=1, max_length=30)]
    value: Annotated[str, Field(min_length=1, max_length=255)]
    # Optional deep-link/profile URL associated with the (channel, value) pair.
    url: Annotated[str | None, Field(max_length=2000)] = None
    is_primary: bool = False


class CustomerContactCreate(CustomerContactBase):
    pass


class CustomerContactResponse(CustomerContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime


class AddressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recipient_name: str | None = None
    street: str
    ward: str | None = None
    district: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    is_default: bool = False


class CustomerBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    notes: str | None = None


class CustomerCreate(CustomerBase):
    contacts: list[CustomerContactCreate] = []
    # Optional single-line address. Stored in addresses.street with is_default=true.
    # Structured fields (province/district/ward) are intentionally omitted from
    # the simple flow — owner asks "where to ship" not "fill in 5 boxes".
    address: Annotated[str | None, Field(min_length=1, max_length=500)] = None


class CustomerUpdate(BaseModel):
    name: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    notes: str | None = None
    # When set, replaces the customer's default address (or creates one if none).
    # Empty string clears nothing — the field is opt-in; pass null to leave alone.
    address: Annotated[str | None, Field(min_length=1, max_length=500)] = None


class CustomerResponse(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    primary_phone: str | None = None
    created_at: datetime
    updated_at: datetime
    contacts: list[CustomerContactResponse] = []
    addresses: list[AddressResponse] = []


class CustomerListItem(BaseModel):
    """Lightweight customer summary embedded in order list responses.

    Lighter than CustomerResponse — omits shop_id, timestamps, notes.
    `primary_phone` is denormalized from `customer_contacts` (DB trigger) so
    list endpoints can skip eager-loading contacts entirely.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    primary_phone: str | None = None
    contacts: list[CustomerContactResponse] = []
