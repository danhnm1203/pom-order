# Use project-local Supabase CLI (frontend/node_modules/.bin/supabase) so all devs
# on this project run the same version. Falls back to system `supabase` if not yet
# installed locally (first-time setup before `npm install`).
SUPABASE := $(shell test -x frontend/node_modules/.bin/supabase && echo "frontend/node_modules/.bin/supabase" || echo "supabase")

.PHONY: help setup setup-backend setup-frontend migrate dev dev-backend dev-frontend test test-regression test-backend test-frontend types-gen clean

help:
	@echo "Pom Order — Make targets"
	@echo ""
	@echo "  make setup          One-time: venv + deps for backend + frontend"
	@echo "  make migrate        Start local Supabase + apply migrations + gen types"
	@echo "  make dev            Backend (8000) + Frontend (5173) in parallel"
	@echo "  make test           All tests (backend + frontend)"
	@echo "  make test-regression  Profit calc regression test only"
	@echo "  make types-gen      Generate TypeScript types from Supabase schema"
	@echo "  make clean          Stop local Supabase, remove build artifacts"

setup: setup-backend setup-frontend
	@echo ""
	@echo "Setup complete. Next: 'make migrate' then 'make dev'."

setup-backend:
	cd backend && python3 -m venv .venv
	cd backend && . .venv/bin/activate && pip install -U pip
	cd backend && . .venv/bin/activate && pip install -e ".[dev]"
	@if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; echo "Created backend/.env from example. Edit it before running 'make dev'."; fi

setup-frontend:
	cd frontend && npm install
	@if [ ! -f frontend/.env ]; then cp frontend/.env.example frontend/.env; echo "Created frontend/.env from example."; fi

migrate:
	$(SUPABASE) start
	$(SUPABASE) migration up --local
	@echo ""
	@echo "Migrations applied. Studio: http://localhost:54323"
	$(MAKE) types-gen

types-gen:
	$(SUPABASE) gen types typescript --local > frontend/src/types/supabase.ts
	@echo "Types regenerated: frontend/src/types/supabase.ts"

dev:
	@echo "Starting backend + frontend in parallel. Ctrl-C stops both."
	@trap 'kill 0' INT; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

dev-backend:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && . .venv/bin/activate && pytest -v

test-regression:
	cd backend && . .venv/bin/activate && pytest tests/regression -v

test-frontend:
	cd frontend && npm test

backup:
	./scripts/backup_db.sh

backup-cron-install:
	./scripts/install_backup_cron.sh

backup-cron-remove:
	./scripts/install_backup_cron.sh --remove

clean:
	$(SUPABASE) stop 2>/dev/null || true
	rm -rf backend/.venv backend/__pycache__ backend/.pytest_cache
	rm -rf frontend/node_modules frontend/dist
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
