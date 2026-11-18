#!/usr/bin/env bash
# usage: serve-local.sh <model.gguf> [port]
#
# Serves a GGUF with llama-server in the foreground, with the template and
# sampling every v3 evaluation used. Keep these flags: a result measured with
# other sampling does not compare with the earlier ones.
#
# Env:
#   LLAMA_SERVER  the llama-server binary
#                 (default $FT_HOME/llama.cpp/build/bin/llama-server)
#   CTX           total context in tokens, split evenly across the slots
#                 (default 65536)
#   NP            parallel slots (default 1). Evaluate with CTX=131072 NP=2:
#                 two 64k slots, one per eval lane.
#   HOST          bind address (default 127.0.0.1)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
model=$1
port=${2:-8090}
bin=${LLAMA_SERVER:-${FT_HOME:-$HOME/.cache/nodetool-finetune}/llama.cpp/build/bin/llama-server}
[ -f "$model" ] || { echo "no GGUF at $model" >&2; exit 1; }
exec "$bin" -m "$model" --alias "$(basename "$model" .gguf)" --host "${HOST:-127.0.0.1}" --port "$port" \
  -ngl 99 -c "${CTX:-65536}" -np "${NP:-1}" -fa on --jinja \
  --chat-template-kwargs '{"enable_thinking":false}' \
  --temp 1.0 --top-k 20 --top-p 0.95 --presence-penalty 1.5
