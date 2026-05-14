# Pom Order

Internal order management for K-beauty (Korean cosmetics) import shop. Track customers, multi-stage payments, FX rates, Korean+international shipping costs.

**Status**: scaffold complete (Tuần 1). See [`docs/DESIGN-mvp.md`](docs/DESIGN-mvp.md) for full plan.

## Stack

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + asyncpg + Pydantic v2 (Python 3.11+)
- **Frontend**: React 18 + Vite + TypeScript + shadcn/ui + Tailwind
- **Database**: Supabase PostgreSQL + Supabase Auth
- **Design**: Utility-first (Linear/Notion/Vercel style) — see [`docs/DESIGN.md`](docs/DESIGN.md)

## Project structure

```
pom_order/
├── backend/          FastAPI service
├── frontend/         React + Vite app
├── supabase/         Migrations + local config
├── docs/             DESIGN-mvp.md, DESIGN.md, SCHEMA-PATCH.sql, TEST-PLAN.md, TODOS.md
└── order.xlsx        Reference: 9 historic orders (used as regression fixture)
```

## Quick start (first time setup)

Requirements: Python 3.11+, Node 20+, Docker (for local Supabase), Supabase CLI.

```bash
# Install Supabase CLI if not present
brew install supabase/tap/supabase

# One-time setup (creates venv, installs deps, generates types)
make setup

# Start local Supabase + apply migrations
make migrate

# Run backend + frontend in parallel
make dev
```

Backend: http://localhost:8000 (OpenAPI docs at `/docs`)
Frontend: http://localhost:5173
Supabase Studio: http://localhost:54323

## Tests

```bash
make test           # All tests
make test-regression  # Just the order.xlsx profit calc regression
```

The regression test validates `compute_order_totals` against 9 historic orders from `order.xlsx`. **MUST pass before any merge touching financial math.**

## Docs

| File | Purpose |
|---|---|
| [`docs/DESIGN-mvp.md`](docs/DESIGN-mvp.md) | Full feature spec + review summaries |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design system (tokens, components, IA) |
| [`docs/SCHEMA-PATCH.sql`](docs/SCHEMA-PATCH.sql) | Migration-ready SQL (canonical source) |
| [`docs/TEST-PLAN.md`](docs/TEST-PLAN.md) | Coverage plan + regression strategy |
| [`docs/TODOS.md`](docs/TODOS.md) | Deferred work (backup, FX auto-pull, etc.) |
| [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | Project conventions for Claude Code |

## Conventions

- Money: always `Decimal` (Python) / `NUMERIC` (Postgres). Never `float`.
- Git commit format: `<type>: <description>` lowercase, imperative. No Co-Authored-By.
- Database: local migration first (`supabase migration up --local`), then push. Never `supabase db reset`.
