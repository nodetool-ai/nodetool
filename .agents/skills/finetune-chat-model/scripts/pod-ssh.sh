#!/usr/bin/env bash
# usage: pod-ssh.sh <pod-id> [remote command...]
#
# Runs a command on a Runpod pod over its public SSH port (or opens a shell
# without one). The address comes from `runpodctl pod get`, so it follows the
# pod across restarts, which can change the port. Every other pod-*.sh script
# goes through this one. Exits 255 when the pod has no reachable SSH address.
#
# Env: FT_SSH_KEY (default ~/.ssh/id_rsa), RUNPODCTL (default runpodctl),
#      FT_POD_ADDR ("<ip> <port>": skip the lookup)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
pod=$1
shift
if [ -n "${FT_POD_ADDR:-}" ]; then
  read -r ip port <<<"$FT_POD_ADDR"
else
  read -r ip port < <("${RUNPODCTL:-runpodctl}" pod get "$pod" 2>/dev/null | python3 -I -c '
import json, sys
try:
    s = json.load(sys.stdin).get("ssh") or {}
except ValueError:
    s = {}
print(s.get("ip") or "-", s.get("port") or "-")' || echo "- -")
fi
if [ "${ip:--}" = "-" ] || [ "${port:--}" = "-" ]; then
  echo "pod $pod has no SSH address yet (still starting, stopped, or awaiting a GPU)" >&2
  exit 255
fi
exec ssh -o ConnectTimeout=20 -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new \
  -i "${FT_SSH_KEY:-$HOME/.ssh/id_rsa}" -p "$port" "root@$ip" "$@"
