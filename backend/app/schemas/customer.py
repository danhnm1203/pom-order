from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerContactBase(BaseModel):
    channel: Annotated[str, Field(pattern="^(phone|zalo|facebook|kakao|email)$")]
    value: Annotated[str, Field(min_length=1, max_length=255)]
    is_primary: bool = False


class CustomerContactCreate(CustomerContactBase):
    pass


class CustomerContactResponse(CustomerContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime


class CustomerBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    notes: str | None = None


class CustomerCreate(CustomerBase):
    contacts: list[CustomerContactCreate] = []


class CustomerUpdate(BaseModel):
    name: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    notes: str | None = None


class CustomerResponse(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    created_at: datetime
    updated_at: datetime
    contacts: list[CustomerContactResponse] = []


class CustomerListItem(BaseModel):
    """Lightweight customer summary embedded in order list responses.

    Lighter than CustomerResponse — omits shop_id, timestamps, notes.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    contacts: list[CustomerContactResponse] = []
