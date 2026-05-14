from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


engine = create_async_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # Supabase kills idle conns; cheap healthcheck before reuse
    echo=False,
)

session_factory = async_sessionmaker(
    engine,
    expire_on_commit=False,  # required for async — avoid attribute refresh after commit
    class_=AsyncSession,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield a session, commit on success, rollback on exception.

    Tradeoff: commit-on-yield ties transactional scope to request scope. For multi-step
    transactions or savepoints, drop auto-commit and commit inside the service.
    """
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Lifespan startup hook. No-op for now (migrations handle schema)."""
    pass


async def close_db() -> None:
    """Lifespan shutdown hook."""
    await engine.dispose()
