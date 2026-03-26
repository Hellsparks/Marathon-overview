#!/bin/bash
# Triggered by PostToolUse hook on Edit/Write.
# Runs the relevant test suite when a backend or frontend source file changes.
# Debounced to 30s per suite to avoid running on every keystroke during multi-file edits.

FILE=$(echo "$CLAUDE_TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

REPO="${CLAUDE_PROJECT_DIR}"
[ -z "$REPO" ] && exit 0

# Skip files that don't affect tests
case "$FILE" in
  */node_modules/*)  exit 0 ;;
  */dist/*)          exit 0 ;;
  *.md|*.sql|*.yml|*.yaml) exit 0 ;;
  *.css|*.json|*.sh|*.py|*.step) exit 0 ;;
esac

# Debounce: skip if the same suite ran within the last 30 seconds
LOCK_DIR="${TMPDIR:-/tmp}/marathon-test-lock"
mkdir -p "$LOCK_DIR"

run_suite() {
  local suite="$1"
  local lock_file="$LOCK_DIR/$suite.lock"
  local now elapsed last=0
  now=$(date +%s)
  [ -f "$lock_file" ] && last=$(cat "$lock_file")
  elapsed=$(( now - last ))
  if [ "$elapsed" -lt 30 ]; then
    echo "[hook] $suite tests skipped (ran ${elapsed}s ago)"
    return
  fi
  echo "$now" > "$lock_file"
  echo "[hook] $FILE changed — running $suite tests..."
  cd "$REPO/$suite" && npm test
}

[[ "$FILE" == "$REPO/backend/src/"* ]]  && run_suite "backend"
[[ "$FILE" == "$REPO/frontend/src/"* ]] && run_suite "frontend"
