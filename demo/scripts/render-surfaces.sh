#!/usr/bin/env bash
# Renders the landing page's seven editor loops to out/surfaces/surface-<id>.mp4.
set -euo pipefail
cd "$(dirname "$0")/.."
for id in storyboard script timeline sketch 3d game nodes; do
  npx remotion render src/heroflow/index.tsx "Surface-$id" "out/surfaces/surface-$id.mp4" "$@"
done
