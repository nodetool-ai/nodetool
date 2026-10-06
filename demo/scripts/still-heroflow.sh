#!/usr/bin/env bash
# Exports every hero-flow design frame to out/heroflow/.
set -euo pipefail
cd "$(dirname "$0")/.."
for id in Overview 1-prompt 2-beats 3-entities 4a-stills 4b-clips 5-timeline; do
  npx remotion still src/heroflow/index.tsx "HeroFlow-$id" "out/heroflow/$id.png"
done
