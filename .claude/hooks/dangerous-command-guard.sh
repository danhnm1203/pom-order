#!/bin/bash
# PreToolUse hook: Block dangerous commands
# Exit 2 = block the tool call

INPUT=$(cat)

DANGEROUS_PATTERNS=(
  "db reset"
  "db:reset"
  "supabase db reset"
  "supabase stop --no-backup"
  "rm -rf /"
  "rm -rf ~"
  "rm -rf \."
  "git reset --hard"
  "git push.*--force"
  "git push.*[[:space:]]-f[^[:alnum:]-]"
  "git clean -fd"
  "DROP DATABASE"
  "DROP SCHEMA"
  "TRUNCATE"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$INPUT" | grep -qiE "$pattern"; then
    echo "BLOCKED: Dangerous command detected: '$pattern'"
    echo "This operation requires explicit user approval."
    exit 2
  fi
done

exit 0
