#!/usr/bin/env bash
# usage: run-detached.sh <name> <log-file> <command> [args...]
#
# Starts a long job that outlives the shell session. With a systemd user
# manager it runs as the transient unit ft-<name>. Without one it runs under
# setsid nohup, and its process group id goes to <log-file>.pid. Output goes
# to <log-file>. A plain nohup job died when the agent session ended, so use
# this for sampling lanes, evaluations and anything else that runs for hours.
#
# systemd-run does not pass the caller's environment on. This script forwards
# PATH, HOME and every FT_*, FINETUNE_*, NODETOOL_*, LLAMA_*, OLLAMA_*, CTX,
# NP, PORT and MANIFEST variable that is set.
#
# Stop:   systemctl --user stop ft-<name>     or   kill -- -$(cat <log-file>.pid)
# Status: systemctl --user is-active ft-<name> or   kill -0 $(cat <log-file>.pid)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -ge 3 ] || { usage >&2; exit 2; }
name=$1 log=$2
shift 2
mkdir -p "$(dirname "$log")"
log=$(cd "$(dirname "$log")" && pwd)/$(basename "$log")

if command -v systemd-run >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
  env_args=(-E PATH -E HOME -E "FT_LOG=$log")
  for var in $(compgen -e); do
    case "$var" in
      FT_* | FINETUNE_* | NODETOOL_* | LLAMA_* | OLLAMA_* | CTX | NP | PORT | MANIFEST) env_args+=(-E "$var") ;;
    esac
  done
  systemd-run --user --unit="ft-$name" --collect -p WorkingDirectory="$PWD" "${env_args[@]}" \
    bash -c 'exec "$@" >>"$FT_LOG" 2>&1' _ "$@"
  echo "started unit ft-$name, log $log"
else
  setsid nohup "$@" >>"$log" 2>&1 </dev/null &
  echo $! >"$log.pid"
  echo "started process group $!, log $log"
fi
