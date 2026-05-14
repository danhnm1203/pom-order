---
name: fastapi-patterns
description: FastAPI patterns for async APIs, dependency injection, Pydantic request and response models, OpenAPI docs, tests, security, and production readiness.
---

# FastAPI Patterns

Production-oriented patterns for FastAPI services. Tailored to the Pom Order stack: FastAPI + SQLAlchemy 2.0 (async) + Supabase PostgreSQL + Supabase Auth.

## When to Use

- Building or reviewing a FastAPI endpoint.
- Splitting routers, schemas, dependencies, and database access.
- Writing async endpoints that call a database or external service.
- Adding authentication, authorization, OpenAPI docs, tests, or deployment settings.
- Checking a FastAPI PR for copy-pasteable examples and production risks.

## How It Works

Treat the FastAPI app as a thin HTTP layer over explicit dependencies and service code:

- `main.py` owns app construction, middleware, exception handlers, and router registration.
- `schemas/` owns Pydantic request and response models.
- `dependencies.py` owns database, auth, pagination, and request-scoped dependencies.
- `services/` or `crud/` owns business and persistence operations.
- `tests/` overrides dependencies instead of opening production resources.

Prefer small routers and explicit `response_model` declarations. Keep raw ORM objects, secrets, and framework globals out of response schemas.

## Project Layout

```text
backend/app/
├── main.py
├── config.py
├── dependencies.py
├── exceptions.py
├── api/
│   └── routes/
│       ├── orders.py
│       ├── items.py
│       ├── suppliers.py
│       └── health.py
├── core/
│   ├── security.py
│   └── middleware.py
├── db/
│   ├── session.py
│   └── crud.py
├── models/
├── schemas/
└── tests/
```

## Application Factory

Use a factory so tests and workers can build the app with controlled settings.

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, orders
from app.config import settings
from app.db.session import close_db, init_db
from app.exceptions import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.api_title,
        version=settings.api_version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        # Disable credentials when CORS is wide-open ([*]) — browsers + Starlette
        # reject the combination. Tie credentials to whether origins are explicit.
        allow_credentials=bool(settings.cors_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    register_exception_handlers(app)
    app.include_router(health.router, prefix="/health", tags=["health"])
    app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
    return app


app = create_app()
```

Do not use `allow_origins=["*"]` with `allow_credentials=True`; browsers reject that combination and Starlette disallows it for credentialed requests.

## Pydantic Schemas

Keep request, update, and response models separate.

```python
from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrderItemBase(BaseModel):
    product_id: UUID
    quantity: Annotated[int, Field(ge=1)]
    unit_price_krw: Annotated[Decimal, Field(max_digits=18, decimal_places=2)]


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemUpdate(BaseModel):
    quantity: Annotated[int | None, Field(ge=1)] = None
    unit_price_krw: Annotated[Decimal | None, Field(max_digits=18, decimal_places=2)] = None


class OrderItemResponse(OrderItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    created_at: datetime
    updated_at: datetime
```

Response models must never include password hashes, access tokens, refresh tokens, or internal authorization state. Currency fields must use `Decimal`, never `float` (see [Pom Order Specifics](#pom-order-specifics)).

## Dependencies

Use dependency injection for request-scoped resources.

```python
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_supabase_token
from app.db.session import session_factory
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_db() -> AsyncIterator[AsyncSession]:
    # Tradeoff: commit-on-yield keeps handlers terse but ties transactional
    # scope to request scope. If services need multi-step transactions or
    # explicit savepoints, drop the auto-commit and commit inside the service.
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_supabase_token(token)
    user_id = UUID(payload["sub"])
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user
```

Avoid creating sessions, clients, or credentials inline inside route handlers.

## Async Endpoints

Keep route handlers async when they perform I/O, and use async libraries inside them.

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.order import Order
from app.models.user import User
from app.schemas.order import OrderResponse


router = APIRouter()


@router.get("/", response_model=list[OrderResponse])
async def list_orders(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Order).order_by(Order.created_at.desc()).limit(limit).offset(offset)
    )
    return result.scalars().all()
```

Use `httpx.AsyncClient` for external HTTP calls from async handlers. Do not call `requests` in an async route — it blocks the event loop.

## Error Handling

Centralize domain exceptions and keep response shapes stable.

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )
```

## OpenAPI Customization

Assign the custom OpenAPI callable to `app.openapi`; do not just call the function once.

```python
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


def install_openapi(app: FastAPI) -> None:
    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        app.openapi_schema = get_openapi(
            title="Pom Order API",
            version="1.0.0",
            routes=app.routes,
        )
        return app.openapi_schema

    app.openapi = custom_openapi
```

## Testing

Override the dependency used by `Depends`, not an internal helper that route handlers never reference.

```python
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.main import create_app


@pytest.fixture
async def client(test_session: AsyncSession):
    app = create_app()

    async def override_get_db():
        yield test_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

## Pom Order Specifics

### Supabase Auth (JWT verification)

The frontend obtains a JWT from Supabase Auth and sends it as `Authorization: Bearer <token>`. The backend verifies signature, issuer, audience, and expiry against Supabase's JWT secret (HS256).

```python
# app/core/security.py
from jose import JWTError, jwt

from app.config import settings
from app.exceptions import ApiError


def decode_supabase_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            issuer=f"{settings.supabase_url}/auth/v1",
        )
    except JWTError as exc:
        raise ApiError(401, "invalid_token", "Invalid or expired token") from exc
```

Always pass `audience` and `issuer` explicitly — omitting them lets a forged token from a different Supabase project pass verification.

For DB queries that need to bypass RLS (admin operations only), use the service-role key from a separate Supabase client; never expose it to the frontend.

### Async Postgres via asyncpg

Supabase exposes a Postgres connection string. Use the asyncpg driver for SQLAlchemy 2.0 async:

```python
# config.py
DATABASE_URL = "postgresql+asyncpg://postgres:<password>@db.<project>.supabase.co:5432/postgres"

# db/session.py
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

engine = create_async_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # Supabase idle connections get killed; cheap healthcheck avoids stale conns
)
session_factory = async_sessionmaker(engine, expire_on_commit=False)
```

`expire_on_commit=False` is the standard recommendation for async sessions — without it, accessing attributes after `commit()` triggers a re-fetch which is awkward in async paths.

### Money columns (KRW / VND / USD)

Per [CLAUDE.md](../../CLAUDE.md): never store currency as `float`. Use Python `Decimal` and Postgres `NUMERIC`:

```python
from decimal import Decimal

from sqlalchemy import Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OrderItem(Base):
    __tablename__ = "order_items"

    # KRW has decimal subunits in some contexts (rare); VND is integer-only.
    amount_krw: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    amount_vnd: Mapped[Decimal] = mapped_column(Numeric(18, 0))

    # FX rate snapshot at order creation time — never recompute historical totals
    # using a current rate.
    fx_rate_krw_to_vnd: Mapped[Decimal] = mapped_column(Numeric(18, 6))
```

Pydantic v2 serializes `Decimal` as a string by default, which preserves precision over the wire. Do not coerce to `float` in the API layer.

## Security Checklist

- Hash passwords with `argon2-cffi`, `bcrypt`, or a current passlib-compatible hasher. (Or delegate entirely to Supabase Auth and skip storing passwords.)
- Validate JWT issuer, audience, expiry, and signing algorithm — always pass `audience=` and `issuer=` to `jwt.decode`.
- Keep CORS origins environment-specific. Never `["*"]` in production.
- Put rate limits on auth and write-heavy endpoints (`slowapi`).
- Use Pydantic models for all request bodies.
- Use ORM parameter binding or SQLAlchemy Core expressions; never build SQL with f-strings.
- Redact tokens, authorization headers, cookies, and passwords from logs.
- Never expose the Supabase service-role key to the frontend or in client-readable env vars.
- Run dependency audit tooling in CI (`/dependency-audit`).

## Performance Checklist

- Configure database connection pooling explicitly (`pool_size`, `max_overflow`, `pool_pre_ping`).
- Add pagination to list endpoints — never return unbounded result sets.
- Watch for N+1 queries; use `selectinload` / `joinedload` for eager loading.
- Use async HTTP (`httpx.AsyncClient`) and async DB drivers (`asyncpg`) in async paths.
- Add response compression only after measuring payload size and CPU tradeoffs.
- Cache stable expensive reads behind explicit invalidation.

## See Also

- Rule: [`rules/security.md`](../rules/security.md) — auth, secrets, input validation
- Rule: [`rules/database.md`](../rules/database.md) — Supabase migration workflow
- Rule: [`rules/testing.md`](../rules/testing.md) — coverage requirements and TDD flow
- Skill: [`tdd-workflow/`](./tdd-workflow/) — write-tests-first methodology
- Skill: [`security-review/`](./security-review/) — security checklist for auth/API/payment code
- Agent: `code-reviewer` — invoke after writing endpoints
- Agent: `security-reviewer` — invoke before commits touching auth or input handling
- Agent: `tdd-guide` — invoke when adding new endpoints
- Command: `/deep-scan` — Trail of Bits deep security scan before release
- Command: `/dependency-audit` — supply chain risk audit
