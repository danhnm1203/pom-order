from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FxRateBase(BaseModel):
    base_currency: Annotated[str, Field(min_length=3, max_length=8)] = "KRW"
    quote_currency: Annotated[str, Field(min_length=3, max_length=8)] = "VND"
    rate: Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=6)]
    source: str | None = "manual"
    notes: str | None = None


class FxRateCreate(FxRateBase):
    pass


class FxRateResponse(FxRateBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    effective_from: datetime
    effective_to: datetime | None
    created_at: datetime
