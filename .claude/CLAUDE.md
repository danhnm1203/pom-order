# Pom Order Project Guidelines

Order management system for tracking items ordered from Korea.

## Stack

- **Backend**: FastAPI (Python 3.11+), SQLAlchemy, Pydantic v2
- **Frontend**: React 18 + Vite + TypeScript
- **Database**: Supabase PostgreSQL (managed Postgres + Auth + Storage)
- **Auth**: Supabase Auth (JWT)

## Project Structure

```
pom_order/
├── backend/         # FastAPI service
│   ├── app/
│   │   ├── main.py          # FastAPI app entry
│   │   ├── api/             # API routes (orders, items, suppliers, etc.)
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas (request/response)
│   │   ├── services/        # Business logic
│   │   ├── db/              # DB session, Supabase client
│   │   └── core/            # Config, security, deps
│   ├── tests/
│   ├── pyproject.toml       # or requirements.txt
│   └── .env
├── frontend/        # React + Vite + TS app
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/             # API client (typed fetch wrappers)
│   │   ├── hooks/
│   │   └── types/
│   ├── package.json
│   └── vite.config.ts
└── supabase/        # Migrations + (optional) edge functions
    └── migrations/
```

## Domain Model (initial draft — refine as the schema grows)

Core entities for Korea-import order management:

| Entity | Purpose |
|---|---|
| `orders` | An order placed with a Korean supplier (status, dates, totals, currency) |
| `order_items` | Line items belonging to an order (product, qty, unit price KRW/VND) |
| `products` | Catalog of items (name, SKU, category, Korean name, weight) |
| `suppliers` | Korean suppliers/vendors (contact, address, shipping terms) |
| `shipments` | Tracking info from Korea → destination (carrier, tracking #, customs) |
| `customers` | End customers receiving the orders |

Always model money with explicit currency (`amount_krw`, `amount_vnd`, or `amount` + `currency` column). Never store mixed currencies in a single column.

## Development

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt    # or: pip install -e .
uvicorn app.main:app --reload --port 8000
```

- API base: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`

### Frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

The frontend reads the API base from `VITE_API_BASE_URL` (set in `frontend/.env`).

## Git Conventions

### Commit Message Format

```
<type>(<optional-scope>): <subject>

<optional body>
```

**Subject must start with lowercase. Use imperative form ("add", not "added").**
**Co-Authored-By は付けない。**

### Allowed Types

`feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`, `style`, `ci`, `build`, `revert`

### Pre-commit Hook Troubleshooting

Claude Code環境では対話的な修正ができないため、必要なら `--no-verify` を使用:

```bash
git commit --no-verify -m "fix(orders): correct currency rounding"
```

### File Dependency Map (同時にコミットすべきファイル群)

| 主ファイル | 依存ファイル | 理由 |
|-----------|-------------|------|
| `backend/app/models/*.py` | `backend/app/schemas/*.py` | DB model変更時はPydantic schemaも同時更新 |
| `backend/app/api/*.py` | `frontend/src/api/*.ts`, `frontend/src/types/*.ts` | APIエンドポイント変更時はクライアント側の型も更新 |
| `*.migration.sql` | `backend/app/models/*.py` | DB schema変更時はORMモデルも同期 |
| FastAPI endpoint | `frontend/src/api/` | レスポンス形状変更時は同一PRで両方更新 |

## Database (Supabase PostgreSQL)

- ローカルDBで `supabase migration up --local` → リモートに `supabase db push` の順序を厳守
- **`supabase db reset` は絶対に実行しない**（PreToolUseフックで自動ブロック済み）
- マイグレーション命名: `supabase migration new "name"` を使用（詳細は `rules/database.md`）

### マイグレーション適用コマンド

```bash
supabase migration up --local           # 1. ローカルに適用
supabase db push                        # 2. リモート（Supabase）にプッシュ
supabase gen types typescript --linked > frontend/src/types/supabase.ts  # 3. TS型再生成
```

### ローカル開発環境

```bash
supabase start    # 起動
supabase stop     # 停止
supabase status   # 確認
```

| サービス | URL/ポート |
|---------|-----------|
| API (Kong) | http://localhost:54321 |
| Studio | http://localhost:54323 |
| Database | localhost:54322 (postgres/postgres) |
| Inbucket (メール) | http://localhost:54324 |

### 禁止事項
- `supabase db reset` を実行しないこと（データが削除される）
- `supabase stop --no-backup` を実行しないこと
- 本番DBへの直接SQL実行禁止（必ずマイグレーション経由）

## API & Auth Patterns

### FastAPI ↔ Supabase

Backendは2つのSupabaseクライアントを使い分ける:
- **anon key**: フロントエンドからのトークン検証用
- **service role key**: バックエンド内のサーバーサイド操作用（RLSバイパス）

```python
# ✅ 正しい: service roleでトークン検証
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
user = supabase.auth.get_user(token)
```

**JWTの `app_metadata` で権限判定。DBテーブルへの直接クエリで権限チェックしない。**

### Currency Handling (CRITICAL)

韓国輸入オーダー管理特有のルール:
- 金額は必ず `Decimal`（Python）/ `string` (TS, large numbers)で扱う。`float` 禁止
- 為替レート（KRW→VND, KRW→USD）はオーダー作成時点でスナップショット保存
- 表示用の換算は frontend で行うが、DB保存値は原通貨を保つ

## Code Review

- 出力形式: `file:line` 形式で簡潔に。優先度（CRITICAL/HIGH/MEDIUM/LOW）とBad/Good例を含める
- Python: 型ヒント必須、`mypy` strict、`ruff` lint pass
- React: バンドルサイズ最適化、不要な再レンダ排除、TypeScript strict mode
- API: OpenAPI schema の精度、リクエスト/レスポンスのZod/Pydantic validation

## Available Resources

### Rules (.claude/rules/) — Always-loaded
- `security.md`, `coding-style.md`, `testing.md`, `git-workflow.md`
- `agents.md`, `performance.md`, `patterns.md`, `database.md`, `hooks.md`, `harness-meta.md`

### Skills (.claude/skills/) — On-demand
- `tdd-workflow/` - TDD methodology
- `security-review/` - Security checklist
- `playwright-skill/` - ブラウザ自動化・UXテスト
- `understand*/` - コードベース知識グラフ・オンボーディング
- Trail of Bits: `differential-review`, `insecure-defaults`, `sharp-edges`, `supply-chain-risk-auditor`, `static-analysis`, `agentic-actions-auditor`

### Commands (.claude/commands/)
- `/tdd` - Test-driven development
- `/plan` - Implementation planning
- `/e2e` - E2E test generation
- `/code-review` - Quality review
- `/build-fix` - Fix build errors
- `/refactor-clean` - Dead code removal
- `/update-docs` - Sync documentation
- `/deep-scan` - Trail of Bitsツールによる深堀りセキュリティスキャン
- `/dependency-audit` - サプライチェーンリスク監査
