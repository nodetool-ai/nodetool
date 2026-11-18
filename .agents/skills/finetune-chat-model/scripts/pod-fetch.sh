#!/usr/bin/env bash
# usage: pod-fetch.sh [--stop] <pod-id> <remote-root> <local-root> <path> [path...]
#
# Copies <path>s (relative to <remote-root>) from the pod with tar over ssh,
# verifies every file with pod-verify.sh, and with --stop stops the pod only
# when every file verified. When a file fails it says so, leaves the pod
# running, and exits 1: fetch again, never stop first. A stopped pod's files
# can become unreachable (see pod-resume.sh).
#
#   pod-fetch.sh --stop <pod-id> /workspace "$FT_HOME" \
#     runs/v4/adapter runs/v4/checkpoints models/v4e3-q4km.gguf
#
# Paths must stay inside <remote-root>: tar drops a leading ../ and the copy
# would land elsewhere. Fetch the GGUFs, the final adapter and every
# checkpoint the next step needs before you stop. Env: RUNPODCTL (runpodctl)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
stop=0
if [ "$1" = "--stop" ]; then
  stop=1
  shift
fi
[ $# -ge 4 ] || { usage >&2; exit 2; }
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
pod=$1 remote=$2 local=$3
shift 3
mkdir -p "$local"
"$here/pod-ssh.sh" "$pod" "tar -C $(printf %q "$remote") -cf - $(printf '%q ' "$@")" |
  tar -C "$local" --no-same-owner -xf -
if "$here/pod-verify.sh" "$pod" "$remote" "$local" "$@"; then
  if [ "$stop" = 1 ]; then
    "${RUNPODCTL:-runpodctl}" pod stop "$pod" >/dev/null
    echo "POD-STOPPED $pod"
  fi
else
  echo "NOT STOPPED: a file did not verify, so fetch it again" >&2
  exit 1
fi
