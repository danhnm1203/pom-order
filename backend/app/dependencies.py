"""FastAPI dependencies — request-scoped resources."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_supabase_token
from app.db.session import session_factory
from app.exceptions import ApiError
from app.models.shop import ShopMember


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield a session; commit on success, rollback on exception."""
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user_id(token: str | None = Depends(oauth2_scheme)) -> UUID:
    """Verify Supabase JWT and return the user's UUID."""
    if not token:
        raise ApiError(401, "missing_token", "Authorization header required")
    payload = decode_supabase_token(token)
    sub = payload.get("sub")
    if not sub:
        raise ApiError(401, "invalid_token", "Token missing 'sub' claim")
    try:
        return UUID(sub)
    except ValueError as exc:
        raise ApiError(401, "invalid_token", "Token 'sub' is not a valid UUID") from exc


async def get_current_shop_id(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    """Return the shop_id the current user belongs to.

    MVP: assume each user belongs to exactly one shop. If multi-shop later,
    this becomes a header-driven selector (e.g., X-Shop-Id) + verification.
    """
    result = await db.execute(
        select(ShopMember.shop_id).where(ShopMember.user_id == user_id).limit(1)
    )
    shop_id = result.scalar_one_or_none()
    if shop_id is None:
        raise ApiError(403, "no_shop_membership", "User is not a member of any shop")
    return shop_id
