"""FastAPI app factory + lifespan."""

from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    customers,
    dashboard,
    fx_rates,
    health,
    orders,
    payments,
    public,
    scrape,
)
from app.config import settings
from app.db.session import close_db, init_db
from app.exceptions import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
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
        # Tie credentials to having explicit origins (Starlette rejects ["*"] + credentials)
        allow_credentials=bool(settings.cors_origins) and "*" not in settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    )

    register_exception_handlers(app)

    # Public + health (no auth)
    app.include_router(health.router, prefix="/health", tags=["health"])
    app.include_router(public.router, prefix="/api/v1/public", tags=["public"])

    # Admin (auth required via dependencies inside each route)
    app.include_router(customers.router, prefix="/api/v1/customers", tags=["customers"])
    app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
    app.include_router(payments.router, prefix="/api/v1/orders", tags=["payments"])
    app.include_router(fx_rates.router, prefix="/api/v1/fx-rates", tags=["fx-rates"])
    app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
    app.include_router(scrape.router, prefix="/api/v1/scrape", tags=["scrape"])

    return app


app = create_app()
