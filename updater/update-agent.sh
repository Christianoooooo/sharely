#!/usr/bin/env bash
#
# Watches the shared control volume for an update request dropped by the web app
# and, when one appears, pulls the latest release and rebuilds the app container.
# This is the only component that talks to the Docker socket.
set -uo pipefail

CONTROL_DIR="${CONTROL_DIR:-/control}"
PROJECT_DIR="${PROJECT_DIR:-/project}"
BRANCH="${UPDATE_BRANCH:-main}"
APP_SERVICE="${APP_SERVICE:-app}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"

REQUEST_FILE="$CONTROL_DIR/update.request"
STATE_FILE="$CONTROL_DIR/update.state"
LOG_FILE="$CONTROL_DIR/update.log"
HEARTBEAT_FILE="$CONTROL_DIR/update.heartbeat"

# Files here are written by root (this agent) but must stay writable by the
# non-root web app, so create everything world-writable (dir 777, files 666).
umask 000
mkdir -p "$CONTROL_DIR"
chmod 777 "$CONTROL_DIR" 2>/dev/null || true
[ -f "$STATE_FILE" ] || echo idle > "$STATE_FILE"

echo "[updater] watching $CONTROL_DIR (branch=$BRANCH, service=$APP_SERVICE)"

while true; do
  # Liveness signal the app polls to know the updater is actually running.
  date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT_FILE"

  if [ -f "$REQUEST_FILE" ]; then
    rm -f "$REQUEST_FILE"
    echo running > "$STATE_FILE"
    : > "$LOG_FILE"
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) update started ===" >> "$LOG_FILE"

    # A failure at any step aborts the subshell; rc captures the outcome. The app
    # container is recreated by the final step, so this agent (a separate service)
    # must survive it — which it does, running outside that container.
    (
      set -e
      cd "$PROJECT_DIR"
      # The checkout is bind-mounted and owned by the host user, not root.
      git config --global --add safe.directory "$PROJECT_DIR"
      git pull --ff-only origin "$BRANCH"
      docker compose build "$APP_SERVICE"
      docker compose up -d "$APP_SERVICE"
    ) >> "$LOG_FILE" 2>&1
    rc=$?

    if [ "$rc" -eq 0 ]; then
      echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) update finished ===" >> "$LOG_FILE"
      echo success > "$STATE_FILE"
    else
      echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) update failed (exit $rc) ===" >> "$LOG_FILE"
      echo error > "$STATE_FILE"
    fi
  fi
  sleep "$POLL_INTERVAL"
done
