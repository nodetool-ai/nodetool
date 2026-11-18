#!/usr/bin/env bash
# usage: pod-wait.sh <pod-id> <remote-log> <marker> [idle-minutes]
#
# Waits until <marker> (such as TRAINING-DONE) appears in <remote-log> on the
# pod, checking once a minute, then prints the log's last lines.
#
# The idle guard: when the log has not grown for idle-minutes (default 30),
# or the pod has not answered for that long, it gives up with exit 3 and
# leaves the pod running. A stalled or crashed run then costs at most that
# long before someone looks. It never stops the pod: results come off with
# pod-fetch.sh --stop, which stops only after every file verifies.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -ge 3 ] || { usage >&2; exit 2; }
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
pod=$1 log=$2 marker=$3 idle=${4:-30}
q=$(printf %q "$log")
last_size=-1 still=0
while :; do
  if state=$("$here/pod-ssh.sh" "$pod" "stat -c %s $q 2>/dev/null || echo 0; grep -c -- $(printf %q "$marker") $q 2>/dev/null || true" 2>/dev/null); then
    size=$(sed -n 1p <<<"$state")
    hits=$(sed -n 2p <<<"$state")
    if [ "${hits:-0}" -gt 0 ]; then
      "$here/pod-ssh.sh" "$pod" "tail -c 2000 $q" | tr '\r' '\n' | tail -8
      echo "$marker found in $log"
      exit 0
    fi
    if [ "$size" = "$last_size" ]; then still=$((still + 1)); else still=0; fi
    last_size=$size
  else
    still=$((still + 1))
  fi
  if [ "$still" -ge "$idle" ]; then
    echo "IDLE: $log unchanged or the pod silent for $idle minutes. The pod is still running." >&2
    "$here/pod-ssh.sh" "$pod" "tail -c 2000 $q" 2>/dev/null | tr '\r' '\n' | tail -8 >&2 || true
    exit 3
  fi
  sleep 60
done
