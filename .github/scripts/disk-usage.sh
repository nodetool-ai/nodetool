#!/usr/bin/env bash
# Snapshot Linux runner storage, or sample it while a command runs.
# Keep output on stdout: an ENOSPC crash can prevent artifact uploads.
set -u

if [[ $(uname -s) != Linux ]]; then
  if (( $# )); then exec "$@"; fi
  exit 0
fi

snapshot() {
  echo "Disk usage at $(date -u +%FT%TZ), image ${ImageOS:-unknown}/${ImageVersion:-unknown}"
  df -hT
  df -i
  # Separate checkout, cache, native output and temporary installs. Bound each
  # walk so diagnostics cannot stall a release on a large or damaged tree.
  for directory in "${GITHUB_WORKSPACE:-$PWD}" "${RUNNER_TEMP:-/tmp}" \
    "${GITHUB_WORKSPACE:-$PWD}/native/timeline" \
    "$HOME/.npm" "$HOME/.cache" "$HOME/actions-runner"; do
    if [[ -d "$directory" ]]; then
      timeout 15s du -x -h --max-depth=1 "$directory" 2>/dev/null || true
    fi
  done
}

snapshot
if (( $# == 0 )); then exit 0; fi

# A failure-only step cannot run when the runner itself dies. Sample while
# npm extracts packages or the linker writes test executables as well.
(
  pause=''
  trap 'if [[ -n "$pause" ]]; then kill "$pause" 2>/dev/null || true; fi' EXIT
  while true; do
    sleep 60 &
    pause=$!
    wait "$pause"
    snapshot
  done
) &
monitor=$!
finish() {
  status=$?
  trap - EXIT
  kill "$monitor" 2>/dev/null || true
  wait "$monitor" 2>/dev/null || true
  snapshot
  if (( status != 0 )); then
    # Compare job-owned trees with system usage without crossing filesystems.
    sudo -n timeout 20s du -x -h --max-depth=1 / 2>/dev/null || true
  fi
  exit "$status"
}
trap finish EXIT
"$@"
exit $?
