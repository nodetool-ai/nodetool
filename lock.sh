#!/usr/bin/env bash
set -euo pipefail

conda-lock lock \
  -f environment.yml \
  --platform osx-64 \
  --platform osx-arm64 \
  --platform linux-64 \
  --platform linux-aarch64 \
  --platform win-64 \
  --kind env \
  --filename-template electron/resources/environment-{platform}

cp environment.yml electron/resources/environment.lock.yml
