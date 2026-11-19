#!/usr/bin/env bash
# usage: try-in-nodetool.sh <state-dir>
#
# Starts a NodeTool dev API server and the web UI against a llama-server that
# already serves the fine-tuned GGUF (serve-local.sh), so a person can try the
# model in the real product. Both get their own ports, and the API its own
# SQLite database under <state-dir>, so your usual NodeTool data stays
# untouched. Logs go to <state-dir>/api.log and web.log. Ctrl-C stops both.
# Pick the model under the llama.cpp provider in the chat's model menu.
#
# Env:
#   LLAMA_URL  the llama-server (default http://127.0.0.1:8090)
#   LLAMA_CTX  context of one server slot in tokens (default 65536). NodeTool
#              compacts the chat against this, so it must not exceed CTX/NP.
#   API_PORT   (default 7787)   WEB_PORT (default 3007)
#   LAN_HOST   this machine's LAN address, to open the UI from another device.
#              The UI then listens on all interfaces, and the API accepts that
#              origin through NODETOOL_ALLOWED_ORIGINS. The operator must open
#              WEB_PORT in the firewall. This script does not.
#
# The API server reads the repository's .env like any dev server. Keep paid
# provider keys out of it if the trial should not spend.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=${NODETOOL_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
state=$(mkdir -p "$1" && cd "$1" && pwd)
llama=${LLAMA_URL:-http://127.0.0.1:8090}
api_port=${API_PORT:-7787} web_port=${WEB_PORT:-3007}
curl -sf "$llama/health" >/dev/null || { echo "no llama-server at $llama: start serve-local.sh first" >&2; exit 1; }

origins="http://localhost:$web_port,http://127.0.0.1:$web_port"
web_host=127.0.0.1
if [ -n "${LAN_HOST:-}" ]; then
  origins="http://$LAN_HOST:$web_port,$origins"
  web_host=0.0.0.0
fi
unset DISPLAY
cd "$repo"
PORT=$api_port DB_PATH=$state/nodetool.sqlite3 LLAMA_CPP_URL=$llama \
  LLAMA_CPP_CONTEXT_LENGTH=${LLAMA_CTX:-65536} NODETOOL_ALLOWED_ORIGINS=$origins \
  node scripts/dev-server.mjs >"$state/api.log" 2>&1 &
api=$!
(cd web && PROXY_API_TARGET=http://localhost:$api_port \
  "$repo/node_modules/.bin/vite" --host "$web_host" --port "$web_port" --strictPort --clearScreen false \
  >"$state/web.log" 2>&1) &
web=$!
trap 'kill "$api" "$web" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$api_port/health" >/dev/null && break
  sleep 3
done
curl -sf "http://127.0.0.1:$api_port/health" >/dev/null || { echo "the API did not start: read $state/api.log" >&2; exit 1; }
echo "NodeTool with $llama: http://${LAN_HOST:-localhost}:$web_port  (API on $api_port, database $state/nodetool.sqlite3)"
wait
