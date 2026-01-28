#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

lock_files=(
  "electron/resources/environment.lock.yml"
  "electron/resources/environment-osx-64.yml"
  "electron/resources/environment-osx-arm64.yml"
  "electron/resources/environment-linux-64.yml"
  "electron/resources/environment-linux-aarch64.yml"
  "electron/resources/environment-win-64.yml"
)

missing=0
for rel_path in "${lock_files[@]}"; do
  file_path="${ROOT_DIR}/${rel_path}"
  if [[ ! -f "${file_path}" ]]; then
    echo "Missing lock file: ${rel_path}"
    missing=1
    continue
  fi

  if ! grep -qE '^  - python(=|$)' "${file_path}"; then
    echo "Missing python dependency in ${rel_path}"
    missing=1
  fi

  if ! grep -qE '^  - uv(=|$)' "${file_path}"; then
    echo "Missing uv dependency in ${rel_path}"
    missing=1
  fi

done

if [[ ${missing} -ne 0 ]]; then
  echo "Lock file validation failed. Regenerate with ./lock.sh if needed."
  exit 1
fi

echo "Lock file validation passed."
