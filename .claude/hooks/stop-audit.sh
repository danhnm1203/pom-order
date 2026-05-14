#!/bin/bash
# Stop hook: Audit new additions for debug statements before session ends
# Exit 2 = ask Claude to continue and fix issues
# Only checks added lines in diff to avoid false positives from pre-existing code

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

cd "$REPO_ROOT"

# Get added lines from ts/tsx/js/jsx files only, excluding test/config files,
# Edge Functions (server-side logging is intentional), and this script
DIFF_HITS=$(
  git diff --unified=0 HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' \
    ':!*.test.*' ':!*.spec.*' ':!*.config.*' ':!jest.*' ':!vitest.*' \
    ':!supabase/functions/**' \
    2>/dev/null \
  | grep '^+[^+]' \
  | grep 'console\.\(log\|debug\)' \
  | grep -v '// eslint-disable' \
  | head -10
)

if [ -n "$DIFF_HITS" ]; then
  echo "=== New debug statements found ==="
  echo "$DIFF_HITS"
  echo ""
  COUNT=$(echo "$DIFF_HITS" | wc -l | tr -d ' ')
  echo "Found $COUNT new line(s) with debug statements. Remove before committing."
  exit 2
fi

exit 0
