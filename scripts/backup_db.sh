#!/usr/bin/env bash
# Pom Order — Daily local backup via pg_dump.
#
# Usage:
#   bin/backup_db.sh                    # backup → backups/YYYY-MM-DD-HHMMSS.sql.gz
#   bin/backup_db.sh /custom/path       # backup → /custom/path/YYYY-MM-DD-HHMMSS.sql.gz
#
# For production: schedule via GitHub Actions cron or local crontab. Upload the
# .sql.gz to off-site storage (Cloudflare R2, Backblaze B2, AWS S3). See
# `scripts/backup_db_to_r2.sh` (TODO) for the cloud variant once you pick a provider.
#
# Restore (one-off, careful):
#   gunzip -c backups/2026-05-14-150000.sql.gz | \
#     PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres

set -euo pipefail

BACKUP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
OUTPUT="$BACKUP_DIR/pom-order-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Defaults match local Supabase. Override via env:
DB_HOST="${POM_DB_HOST:-127.0.0.1}"
DB_PORT="${POM_DB_PORT:-54322}"
DB_USER="${POM_DB_USER:-postgres}"
DB_PASS="${POM_DB_PASS:-postgres}"
DB_NAME="${POM_DB_NAME:-postgres}"

echo "Backing up $DB_NAME @ $DB_HOST:$DB_PORT → $OUTPUT"

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  --schema=public \
  --no-owner --no-privileges \
  --format=plain \
  --verbose \
  "$DB_NAME" 2>/dev/null \
  | gzip > "$OUTPUT"

SIZE=$(du -h "$OUTPUT" | cut -f1)
ROWS=$(gunzip -c "$OUTPUT" | grep -c "^COPY " || true)
echo "✓ Backup: $OUTPUT ($SIZE, $ROWS tables)"

# Retain last 30 backups locally
find "$BACKUP_DIR" -name "pom-order-*.sql.gz" -type f | \
  sort -r | tail -n +31 | xargs -r rm -v
echo "Older backups (>30) pruned."
