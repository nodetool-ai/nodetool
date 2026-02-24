#!/bin/bash
set -e

# Go to repo root
cd "$(dirname "$0")/../../.."

NODETOOL_VERSION=$(grep '"version":' electron/package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[:space:]')
PEP440_VERSION=$(echo "$NODETOOL_VERSION" | sed -E 's/-([a-zA-Z]+)\.?([0-9]*)/\1\2/')

echo "Detected NodeTool version: $NODETOOL_VERSION (PEP 440: $PEP440_VERSION)"

VENV_DIR="e2e_venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "Installing dependencies..."
pip install --upgrade pip

echo "Installing nodetool packages..."
pip install --extra-index-url https://nodetool-ai.github.io/nodetool-registry/simple/ \
    "nodetool-core==$PEP440_VERSION" \
    "nodetool-base==$PEP440_VERSION" \
    "fastapi==0.115.6" \
    "starlette==0.41.3"

echo "Forcing downgrade of anyio..."
# anyio 4.x removes `anyio._backends`, which causes crashes with the current
# combination of nodetool-core/starlette/fastapi.
# See: https://github.com/agronholm/anyio/releases/tag/4.0.0
pip install "anyio<4" --no-deps --force-reinstall

echo "Environment setup complete."
