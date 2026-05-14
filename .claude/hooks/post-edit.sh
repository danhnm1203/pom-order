#!/bin/bash
# PostToolUse hook: Warn about console.log after Edit/Write

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -oE '"file_path"\s*:\s*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

CONSOLE_LOGS=$(grep -n "console\.\(log\|debug\|info\)" "$FILE_PATH" 2>/dev/null | grep -v "// eslint-disable" | grep -v "// console" | head -5)
if [ -n "$CONSOLE_LOGS" ]; then
  echo "WARNING: console.log detected in $FILE_PATH:"
  echo "$CONSOLE_LOGS"
  echo "Remove before committing."
fi

exit 0
