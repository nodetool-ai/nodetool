#!/usr/bin/env bash
#
# Start the NodeTool API server in production using pm2.
#
# Usage:
#   ./scripts/start-production.sh          # start or restart
#   ./scripts/start-production.sh stop     # stop the server
#   ./scripts/start-production.sh logs     # tail logs
#   ./scripts/start-production.sh status   # show process status
#
# Environment:
#   PORT          — HTTPS port (default: 8443)
#   HOST          — Bind address (default: 0.0.0.0)
#   TLS_CERT      — Path to cert.pem (auto-detected)
#   TLS_KEY       — Path to key.pem  (auto-detected)
#   NODE_ENV      — Node environment (default: production)
#   ENV_FILE      — Path to .env file (default: .env in repo root)
#   DB_PATH       — SQLite database path

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="nodetool-api"
ENTRY="$ROOT_DIR/packages/websocket/dist/server.js"

# Load .env file
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
if [ -f "$ENV_FILE" ]; then
  echo "Loading env from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "Warning: no .env file found at $ENV_FILE"
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8443}"
export NODE_ENV="${NODE_ENV:-production}"

cd "$ROOT_DIR"

case "${1:-start}" in
  stop)
    pm2 stop "$APP_NAME" 2>/dev/null && echo "Stopped $APP_NAME" || echo "Not running"
    ;;
  logs)
    pm2 logs "$APP_NAME" --lines 50
    ;;
  status)
    pm2 show "$APP_NAME"
    ;;
  start|restart)
    if [ ! -f "$ENTRY" ]; then
      echo "Building packages..."
      npm run build --workspaces --if-present
    fi

    pm2 delete "$APP_NAME" 2>/dev/null || true
    pm2 start "$ENTRY" \
      --name "$APP_NAME" \
      --cwd "$ROOT_DIR" \
      --max-memory-restart 2G \
      --restart-delay 3000 \
      --max-restarts 50 \
      --exp-backoff-restart-delay 1000

    echo ""
    echo "Server started: https://$HOST:$PORT"
    echo ""
    echo "  pm2 logs $APP_NAME     — view logs"
    echo "  pm2 monit              — live dashboard"
    echo "  pm2 save               — persist across reboots"
    echo "  pm2 startup            — auto-start on boot"
    ;;
  *)
    echo "Usage: $0 {start|stop|logs|status}"
    exit 1
    ;;
esac
