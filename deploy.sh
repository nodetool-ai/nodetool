#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Nodetool TS Server — Docker HTTPS Deploy
# Builds image from packages/websocket, deploys with native TLS on a free port.
# Uses cert.pem, key.pem, and .env from this directory.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="nodetool-ts"
IMAGE_TAG="latest"
CONTAINER_NAME="nodetool-server"

# Ensure required files exist
for f in "$SCRIPT_DIR/cert.pem" "$SCRIPT_DIR/key.pem" "$SCRIPT_DIR/.env"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: Required file not found: $f"
        exit 1
    fi
done

# Find a free port
find_free_port() {
    python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(('', 0))
port = s.getsockname()[1]
s.close()
print(port)
"
}

HTTPS_PORT="${NODETOOL_HTTPS_PORT:-$(find_free_port)}"

echo "=== Nodetool TS Server — Docker HTTPS Deploy ==="
echo "HTTPS port: $HTTPS_PORT"
echo ""

# Step 1: Build Docker image
echo "--- Building Docker image: $IMAGE_NAME:$IMAGE_TAG ---"

# Create .dockerignore for faster builds
cat > "$SCRIPT_DIR/.dockerignore" << 'EOF'
node_modules
.git
.deploy
electron
mobile
web
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
EOF

docker build \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -f "$SCRIPT_DIR/Dockerfile" \
    "$SCRIPT_DIR"

echo ""
echo "--- Image built successfully ---"

# Step 2: Stop existing container
echo "--- Stopping existing container (if any) ---"
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# Step 3: Run with TLS, env file, and certs
echo "--- Starting container ---"
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "${HTTPS_PORT}:7777" \
    --env-file "$SCRIPT_DIR/.env" \
    -e HOST=0.0.0.0 \
    -e PORT=7777 \
    -e NODETOOL_ENV=production \
    -e TLS_CERT=/certs/cert.pem \
    -e TLS_KEY=/certs/key.pem \
    -v "$SCRIPT_DIR/cert.pem:/certs/cert.pem:ro" \
    -v "$SCRIPT_DIR/key.pem:/certs/key.pem:ro" \
    "$IMAGE_NAME:$IMAGE_TAG"

# Step 4: Wait for health
echo "--- Waiting for server to be healthy ---"
for i in $(seq 1 30); do
    if curl -fsk "https://localhost:${HTTPS_PORT}/health" >/dev/null 2>&1; then
        echo "Health check passed!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "WARNING: Health check not passing yet, check logs"
        docker logs --tail 20 "$CONTAINER_NAME"
    fi
    sleep 2
done

echo ""
echo "=== Deployment started ==="
echo ""
echo "  HTTPS: https://localhost:${HTTPS_PORT}"
echo "  Health: curl -k https://localhost:${HTTPS_PORT}/health"
echo "  WebSocket: wss://localhost:${HTTPS_PORT}/ws"
echo ""
echo "  Logs:  docker logs -f $CONTAINER_NAME"
echo "  Stop:  docker stop $CONTAINER_NAME && docker rm $CONTAINER_NAME"
echo ""

# Save port for programmatic use
mkdir -p "$SCRIPT_DIR/.deploy"
echo "HTTPS_PORT=${HTTPS_PORT}" > "$SCRIPT_DIR/.deploy/ports.env"
echo "Port config saved to .deploy/ports.env"
