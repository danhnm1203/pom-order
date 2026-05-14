#!/bin/bash
# PostToolUse hook: Remind about ADR when architectural files are changed

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -oE '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  */migrations/*.sql)
    echo "ADR REMINDER: Database migration changed. Consider recording an ADR (/adr) if this is a significant schema decision."
    ;;
  */supabase/functions/*)
    echo "ADR REMINDER: Edge Function changed. Consider recording an ADR (/adr) if this changes the auth flow or API contract."
    ;;
  */package.json)
    echo "ADR REMINDER: Dependencies changed. Consider recording an ADR (/adr) if adding a major dependency or changing build tooling."
    ;;
  */tsconfig*.json)
    echo "ADR REMINDER: TypeScript config changed. Consider recording an ADR (/adr) if this affects compilation targets or module resolution."
    ;;
  */.env*|*/wrangler.toml|*/vite.config*)
    echo "ADR REMINDER: Infrastructure config changed. Consider recording an ADR (/adr) if this is a significant environment or deployment change."
    ;;
esac

exit 0
