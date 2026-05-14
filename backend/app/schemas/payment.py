from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.payment import PaymentType


class PaymentBase(BaseModel):
    amount_vnd: Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=0)]
    type: PaymentType
    method_id: UUID | None = None
    paid_at: datetime | None = None
    reference: str | None = None
    notes: str | None = None


class PaymentCreate(PaymentBase):
    """Idempotency-Key passed via HTTP header, not body."""

    pass


class PaymentResponse(PaymentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    shop_id: UUID
    created_at: datetime
