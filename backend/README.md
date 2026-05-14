# Pom Order Backend

FastAPI + SQLAlchemy 2.0 async + asyncpg + Supabase Auth.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # fill in Supabase credentials
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs: http://localhost:8000/docs

## Test

```bash
pytest                          # all
pytest tests/regression -v      # profit calc regression (CRITICAL)
pytest --cov=app                # with coverage
```

## Structure

```
app/
├── main.py                     FastAPI app factory + lifespan
├── config.py                   Pydantic settings (env vars)
├── exceptions.py               ApiError + global handlers
├── dependencies.py             get_db, get_current_user, get_current_shop
├── core/
│   └── security.py             Supabase JWT verification
├── db/
│   ├── base.py                 SQLAlchemy declarative base
│   └── session.py              Async engine + session factory
├── models/                     SQLAlchemy ORM models (16 tables)
├── schemas/                    Pydantic request/response models
├── services/
│   ├── order_calculations.py   ⭐ compute_order_totals (financial math)
│   └── order_status.py         State machine (status transitions)
└── api/routes/                 FastAPI routers (health, public, ...)
```

## Critical files

- `app/services/order_calculations.py` — single source of truth for financial math. Decimal throughout.
- `tests/regression/test_profit_calc.py` — validates against 9 orders from `order.xlsx`. **MUST pass.**

## Conventions

- **Money**: always `Decimal`. Never `float`.
- **DB queries**: SQLAlchemy 2.0 async style. `async with session.begin():` for transactions.
- **Auth**: Supabase JWT verified with `python-jose`. Always validate `aud` + `iss`.
- **RLS**: backend uses user JWT for user-facing ops; service_role only for audit_log inserts.

See [`docs/`](../docs/) at repo root for full design specs.
