#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Nodetool Production Deploy
#
# Builds API + web frontend into a single Docker image with zero-downtime
# rolling deploys. Cloudflare terminates public TLS — origin runs plain HTTP
# by default.
#
# TLS modes:
#   (default)       Plain HTTP origin — Cloudflare "Flexible" SSL
#   --self-signed   Auto-generated cert — Cloudflare "Full" SSL
#   --certs         Bring cert.pem + key.pem — Cloudflare "Full (Strict)"
#
# Usage:
#   ./deploy.sh                  # Build + deploy (HTTP, behind Cloudflare)
#   ./deploy.sh --self-signed    # Auto-generate TLS cert for origin
#   ./deploy.sh --certs          # Use existing cert.pem + key.pem
#   ./deploy.sh --no-build       # Deploy existing image (skip build)
#   ./deploy.sh --logs           # Tail container logs
#   ./deploy.sh --status         # Show container status + health
#   ./deploy.sh --rollback       # Rollback to previous image
#   ./deploy.sh --stop           # Stop the server
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="nodetool-ts"
IMAGE_TAG="latest"
IMAGE_TAG_PREV="rollback"
CONTAINER_NAME="nodetool-server"
PORT="${NODETOOL_PORT:-443}"
HEALTH_TIMEOUT=60
HEALTH_INTERVAL=2

# Parse flags
NO_BUILD=0
TLS_MODE="none"  # none | self-signed | certs

for arg in "$@"; do
  case "$arg" in
    --logs)
      docker logs -f "$CONTAINER_NAME" 2>&1
      exit 0
      ;;
    --status)
      echo "=== Container Status ==="
      docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
      echo ""
      echo "=== Health Check ==="
      if curl -fsk "https://localhost:${PORT}/health" 2>/dev/null; then
        echo ""
      elif curl -fs "http://localhost:${PORT}/health" 2>/dev/null; then
        echo ""
      else
        echo "UNHEALTHY"
      fi
      echo ""
      echo "=== Resource Usage ==="
      docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" "$CONTAINER_NAME" 2>/dev/null || echo "Container not running"
      exit 0
      ;;
    --stop)
      echo "Stopping $CONTAINER_NAME..."
      docker stop "$CONTAINER_NAME" 2>/dev/null || true
      docker rm "$CONTAINER_NAME" 2>/dev/null || true
      echo "Stopped."
      exit 0
      ;;
    --rollback)
      if ! docker image inspect "$IMAGE_NAME:$IMAGE_TAG_PREV" &>/dev/null; then
        echo "ERROR: No rollback image found ($IMAGE_NAME:$IMAGE_TAG_PREV)"
        exit 1
      fi
      echo "Rolling back to previous image..."
      docker tag "$IMAGE_NAME:$IMAGE_TAG_PREV" "$IMAGE_NAME:$IMAGE_TAG"
      NO_BUILD=1
      ;;
    --no-build)    NO_BUILD=1 ;;
    --self-signed) TLS_MODE="self-signed" ;;
    --certs)       TLS_MODE="certs" ;;
    --help|-h)
      sed -n '3,20p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

# ── Preflight ────────────────────────────────────────────────────────

if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
  echo "ERROR: .env file not found in $SCRIPT_DIR"
  exit 1
fi

if [[ "$TLS_MODE" == "certs" ]]; then
  for f in "$SCRIPT_DIR/cert.pem" "$SCRIPT_DIR/key.pem"; do
    if [[ ! -f "$f" ]]; then
      echo "ERROR: --certs requires $f"
      exit 1
    fi
  done
fi

# Generate self-signed cert if needed
CERTS_DIR="$SCRIPT_DIR/.deploy/certs"
if [[ "$TLS_MODE" == "self-signed" ]]; then
  mkdir -p "$CERTS_DIR"
  if [[ ! -f "$CERTS_DIR/cert.pem" ]] || [[ ! -f "$CERTS_DIR/key.pem" ]]; then
    echo "--- Generating self-signed TLS certificate ---"
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$CERTS_DIR/key.pem" \
      -out "$CERTS_DIR/cert.pem" \
      -days 3650 \
      -subj "/CN=nodetool-origin" \
      2>/dev/null
    echo "Certificate generated (valid 10 years, Cloudflare 'Full' SSL mode)."
  fi
fi

echo "=== Nodetool Production Deploy ==="
echo "Port: $PORT | TLS: $TLS_MODE"
echo ""

# ── Build ────────────────────────────────────────────────────────────

if [[ "$NO_BUILD" != "1" ]]; then
  echo "--- Building web frontend ---"
  (cd "$SCRIPT_DIR/web" && NODE_OPTIONS="--max-old-space-size=4096" npm run build)
  echo ""

  echo "--- Building Docker image ---"

  cat > "$SCRIPT_DIR/.dockerignore" << 'IGNORE'
node_modules
.git
.deploy
electron
mobile
workflow_runner
docs
.github
*.md
.env
cert.pem
key.pem
packages/fal-codegen
packages/replicate-codegen
packages/kie-codegen
packages/kie-nodes
IGNORE

  # Save rollback
  if docker image inspect "$IMAGE_NAME:$IMAGE_TAG" &>/dev/null; then
    docker tag "$IMAGE_NAME:$IMAGE_TAG" "$IMAGE_NAME:$IMAGE_TAG_PREV"
  fi

  docker build -t "$IMAGE_NAME:$IMAGE_TAG" -f "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR"
  echo "Image built."
  echo ""
fi

# ── Docker run args builder ──────────────────────────────────────────

build_run_args() {
  local name="$1"
  local host_port="$2"

  RUN_ARGS=(
    -d --name "$name" --restart unless-stopped
    -p "${host_port}:7777"
    --env-file "$SCRIPT_DIR/.env"
    -e HOST=0.0.0.0 -e PORT=7777
    -e NODETOOL_ENV=production
    -e STATIC_FOLDER=/app/web/dist
    --memory=4g --cpus=2
    -v "$SCRIPT_DIR/web/dist:/app/web/dist:ro"
  )

  # TLS mounts
  case "$TLS_MODE" in
    self-signed)
      RUN_ARGS+=(
        -e TLS_CERT=/certs/cert.pem -e TLS_KEY=/certs/key.pem
        -v "$CERTS_DIR/cert.pem:/certs/cert.pem:ro"
        -v "$CERTS_DIR/key.pem:/certs/key.pem:ro"
      )
      ;;
    certs)
      RUN_ARGS+=(
        -e TLS_CERT=/certs/cert.pem -e TLS_KEY=/certs/key.pem
        -v "$SCRIPT_DIR/cert.pem:/certs/cert.pem:ro"
        -v "$SCRIPT_DIR/key.pem:/certs/key.pem:ro"
      )
      ;;
  esac

  RUN_ARGS+=("$IMAGE_NAME:$IMAGE_TAG")
}

# ── Health check ─────────────────────────────────────────────────────

wait_healthy() {
  local name="$1" port="$2" elapsed=0
  echo "Waiting for health (timeout: ${HEALTH_TIMEOUT}s)..."
  while (( elapsed < HEALTH_TIMEOUT )); do
    if curl -fsk "https://localhost:${port}/health" 2>/dev/null \
    || curl -fs  "http://localhost:${port}/health"  2>/dev/null; then
      echo "Healthy (${elapsed}s)."
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
    (( elapsed += HEALTH_INTERVAL ))
  done
  echo "ERROR: Health check failed after ${HEALTH_TIMEOUT}s"
  docker logs --tail 30 "$name" 2>&1
  return 1
}

# ── Deploy ───────────────────────────────────────────────────────────

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "--- Rolling deploy ---"

  TEMP_PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")

  build_run_args "${CONTAINER_NAME}-new" "$TEMP_PORT"
  docker run "${RUN_ARGS[@]}"

  if ! wait_healthy "${CONTAINER_NAME}-new" "$TEMP_PORT"; then
    echo "New container unhealthy — aborting, keeping old container."
    docker stop "${CONTAINER_NAME}-new" 2>/dev/null || true
    docker rm "${CONTAINER_NAME}-new" 2>/dev/null || true
    exit 1
  fi

  # Swap
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
  docker stop "${CONTAINER_NAME}-new" 2>/dev/null || true
  docker rm "${CONTAINER_NAME}-new" 2>/dev/null || true

  build_run_args "$CONTAINER_NAME" "$PORT"
  docker run "${RUN_ARGS[@]}"
  wait_healthy "$CONTAINER_NAME" "$PORT"

else
  echo "--- Fresh deploy ---"
  build_run_args "$CONTAINER_NAME" "$PORT"
  docker run "${RUN_ARGS[@]}"
  wait_healthy "$CONTAINER_NAME" "$PORT"
fi

# ── Summary ──────────────────────────────────────────────────────────

PROTO=$([[ "$TLS_MODE" != "none" ]] && echo "https" || echo "http")

echo ""
echo "=== Deploy Complete ==="
echo ""
echo "  Server:    ${PROTO}://localhost:${PORT}"
echo "  Health:    curl -sk ${PROTO}://localhost:${PORT}/health"
echo "  WebSocket: $([[ "$TLS_MODE" != "none" ]] && echo "wss" || echo "ws")://localhost:${PORT}/ws"
echo ""
echo "  Logs:      $0 --logs"
echo "  Status:    $0 --status"
echo "  Stop:      $0 --stop"
echo "  Rollback:  $0 --rollback"
echo ""

mkdir -p "$SCRIPT_DIR/.deploy"
echo "PORT=${PORT}" > "$SCRIPT_DIR/.deploy/ports.env"
echo "TLS_MODE=${TLS_MODE}" >> "$SCRIPT_DIR/.deploy/ports.env"
