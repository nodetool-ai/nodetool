#!/usr/bin/env bash
# usage: pod-upload.sh <pod-id> <local-bundle-dir> <remote-dir>
#
# Copies a training bundle (see make-bundle.sh) to the pod with tar over ssh,
# since the pod image has no rsync, then verifies every file with
# pod-verify.sh. Put <remote-dir> on the network volume, under /workspace.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -eq 3 ] || { usage >&2; exit 2; }
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
pod=$1 bundle=$2 remote=$3
[ -d "$bundle" ] || { echo "no bundle at $bundle" >&2; exit 1; }
r=$(printf %q "$remote")
tar -C "$bundle" -cf - . | "$here/pod-ssh.sh" "$pod" "mkdir -p $r && tar -C $r --no-same-owner -xf -"
"$here/pod-verify.sh" "$pod" "$remote" "$bundle" .
