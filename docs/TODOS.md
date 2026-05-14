# TODOs — Pom Order

Captured from `/plan-eng-review` on 2026-05-12. Each item has motivation, current state, and starting point so anyone (including future-you) can pick it up cold.

---

## 1. Daily Backup Script

**What:** Automated daily export of Supabase database to off-site storage.

**Why:** Supabase free tier only retains 1 day of backups. Pom Order data (customers, orders, payments) is critical — losing 1 week of orders = lost trust + potential financial dispute with khách.

**Pros:** Disaster recovery. Cheap (~$0.10/mo storage on R2/B2). Enables point-in-time restore.
**Cons:** 4 hours setup. Adds GitHub Actions cron dependency. Need secrets management for storage credentials.

**Context:**
- Schema dump every 24h via `pg_dump` from Supabase connection string
- Encrypted + uploaded to Cloudflare R2 or Backblaze B2
- Retention: 30 days
- Manual restore tested before relying on backup

**Depends on:** MVP shipped + 30 days dogfood data (so backup matters).
**Blocked by:** Decision on storage provider.

**Start here:** `.github/workflows/daily-backup.yml`, `scripts/backup-db.sh`. Use `gpg --symmetric` for encryption.

---

## 2. FX Rate Auto-Pull from API

**What:** Replace manual FX rate entry with automated daily pull from a public FX API.

**Why:** Manual rate setting is friction. User can forget → orders báo giá sai. Auto-pull eliminates that class of bug.

**Pros:** Removes 1 friction point. FX always fresh. Manual override still available (just write to `fx_rates` table directly).
**Cons:** Adds external dependency (rate limits, downtime). Need fallback to manual when API fails.

**Context:**
- Free tier APIs: `exchangerate-api.com` (1500 calls/mo), `frankfurter.app` (unlimited, EU-hosted), `apilayer.com` (1000/mo).
- Daily cron at 09:00 Vietnam time (after Korean market open).
- INSERT new row in `fx_rates`, close previous (`effective_to = now()`).
- Source field: `api_exchangerate` or `api_frankfurter`.

**Depends on:** MVP shipped, manual FX flow works.
**Blocked by:** Pick API provider after 2 weeks of dogfood (see which FX rate matches your actual buy rate best).

**Start here:** `backend/app/services/fx_rate_sync.py`, scheduled via GitHub Actions or Supabase Edge Function cron.

---

## 3. `audit_log` Retention Policy

**What:** Cleanup job to prune `audit_log` rows older than N years.

**Why:** Table currently grows unbounded. At 10-50 orders/month × 5 actions/order ≈ 3000 rows/year. After 5 years = 15k rows. Not urgent, but plan for archival.

**Pros:** Prevent table bloat. Compliance-friendly (data minimization).
**Cons:** Loses historical detail. Need archive-before-delete for audit trail integrity.

**Context:**
- Default retention: 3 years (covers typical small-business audit window).
- Archive to JSON.gz in cold storage before deletion.
- Cron: monthly, off-peak.

**Depends on:** 12+ months of usage. Not urgent for first year.
**Blocked by:** Storage decision (same as #1).

**Start here:** Defer until end of year 1. Note in calendar.
