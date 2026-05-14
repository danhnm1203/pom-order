"""Pytest fixtures shared across test suites."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest

# Set test env BEFORE importing app
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-not-real")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@127.0.0.1:54322/postgres"
)


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


# DB session fixture — only used by integration tests that hit local Supabase.
# Unit/regression tests (like test_profit_calc.py) don't need this.

@pytest.fixture
async def test_session() -> AsyncIterator[object]:
    """Yield a DB session for integration tests. Skipped if Supabase isn't running."""
    try:
        from sqlalchemy.ext.asyncio import AsyncSession

        from app.db.session import session_factory

        async with session_factory() as session:
            yield session
            await session.rollback()  # don't persist test data
    except Exception as e:
        pytest.skip(f"Local Supabase not available: {e}")
