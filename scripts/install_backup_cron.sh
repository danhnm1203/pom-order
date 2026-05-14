#!/usr/bin/env bash
# Install a daily cron job that runs `make backup` at 2 AM local time.
#
# Idempotent — safe to re-run. Won't duplicate the entry.
#
# Usage:
#   ./scripts/install_backup_cron.sh           # install
#   ./scripts/install_backup_cron.sh --remove  # uninstall

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_TAG="# pom-order-daily-backup"
CRON_LINE="0 2 * * * cd $PROJECT_DIR && /usr/bin/make backup >> $PROJECT_DIR/backups/cron.log 2>&1 $CRON_TAG"

case "${1:-install}" in
  install)
    # Read existing crontab (or empty), strip any prior pom-order line, append new
    EXISTING="$(crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true)"
    NEW="$EXISTING
$CRON_LINE"
    echo "$NEW" | sed '/^$/d' | crontab -
    echo "✓ Installed daily backup cron @ 2 AM"
    echo "  Verify: crontab -l | grep pom-order"
    ;;
  --remove|remove)
    EXISTING="$(crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true)"
    if [ -z "$EXISTING" ]; then
      crontab -r 2>/dev/null || true
    else
      echo "$EXISTING" | sed '/^$/d' | crontab -
    fi
    echo "✓ Removed pom-order backup cron"
    ;;
  *)
    echo "Usage: $0 [install|--remove]"
    exit 1
    ;;
esac
