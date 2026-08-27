#!/bin/sh

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PID_DIR="$REPO_ROOT/scripts/pids"
LOG_DIR="$REPO_ROOT/logs"
LOCK_DIR="$PID_DIR/.lifecycle.lock"

acquire_lifecycle_lock() {
  mkdir -p "$PID_DIR" "$LOG_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "Lifecycle lock is already held: $LOCK_DIR" >&2
    return 1
  fi
  printf '%s\n' "$$" > "$LOCK_DIR/pid"
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM HUP
}

run_lifecycle() {
  command_name="$1"
  shift
  node "$REPO_ROOT/scripts/dev-process.mjs" "$command_name" "$@"
}
