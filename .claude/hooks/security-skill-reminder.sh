#!/bin/bash
# PostToolUse hook: Remind about Trail of Bits security skills when relevant files change

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -oE '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  */package.json|*/pnpm-lock.yaml)
    echo "SUPPLY CHAIN: Dependencies changed. Consider running supply-chain-risk-auditor skill to audit new/updated packages."
    ;;
  */.env*|*/wrangler.toml|*/config.toml)
    echo "INSECURE DEFAULTS: Config file changed. Consider running insecure-defaults skill to detect fail-open patterns."
    ;;
  */.github/workflows/*.yml|*/.github/workflows/*.yaml|*/.github/actions/*)
    echo "ACTIONS SECURITY: CI/CD workflow changed. Consider running agentic-actions-auditor skill to check for injection risks."
    ;;
esac

exit 0
