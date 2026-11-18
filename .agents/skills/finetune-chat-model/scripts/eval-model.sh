#!/usr/bin/env bash
# usage: eval-model.sh <label> <model.gguf | -> <eval-dir>
#
# Evaluates one GGUF on the frozen validation split:
#   1. splits the validation tasks not yet in <eval-dir>/*.jsonl into lanes,
#   2. serves the GGUF with serve-local.sh (CTX=131072 NP=2 unless set),
#   3. checks the speed with llama-speed.sh and stops when the GPU is shared,
#   4. runs the lanes with sample-lanes.sh (-p llamacpp --split val),
#   5. stops the server.
# Rerunning it resumes: finished tasks are skipped. Results land in
# <eval-dir>/<label>-l<n>.jsonl. Run it detached, since a pass takes hours:
#
#   MANIFEST=$FT_HOME/manifest.json run-detached.sh eval-v4e3 runs/eval-v4e3/eval.log \
#     eval-model.sh v4e3 "$FT_HOME/models/v4e3-q4km.gguf" runs/eval-v4e3
#
# Env:
#   MANIFEST      the browser tool manifest, required (see dump-tool-manifest.sh)
#   PORT          port for the server this script starts (default 8090)
#   LANES         parallel lanes (default 2). NP defaults to the same number.
#   SAMPLES       runs per task (default 1). Use 2 for a decision (significance.py).
#   TIMEOUT_MS    per-run timeout (default 1800000)
#   FT_LLAMA_URL  use a llama-server that is already running, such as an ssh
#                 tunnel to a pod, instead of starting one. Pass - as the GGUF.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -eq 3 ] || { usage >&2; exit 2; }
label=$1 gguf=$2 dir=$3
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=${NODETOOL_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
: "${MANIFEST:?set MANIFEST to the browser tool manifest}"
[ -s "$MANIFEST" ] || { echo "MANIFEST $MANIFEST is missing or empty" >&2; exit 1; }
port=${PORT:-8090} lanes=${LANES:-2} samples=${SAMPLES:-1}
mkdir -p "$dir"
dir=$(cd "$dir" && pwd)
MANIFEST=$(cd "$(dirname "$MANIFEST")" && pwd)/$(basename "$MANIFEST")

python3 -I "$here/make-lanes.py" --valset "$repo/packages/websocket/scripts/finetune-validation-set.json" \
  --out-dir "$dir" --lanes "$lanes" --done "$dir/*.jsonl" --model "$label" --samples "$samples"
if ! grep -qs . "$dir"/lane*.txt; then
  echo "$label: every task is done"
  exit 0
fi

if [ -n "${FT_LLAMA_URL:-}" ]; then
  url=$FT_LLAMA_URL
else
  if curl -sf "http://127.0.0.1:$port/health" >/dev/null; then
    echo "a server already answers on port $port: stop it or set PORT" >&2
    exit 1
  fi
  CTX=${CTX:-131072} NP=${NP:-$lanes} "$here/serve-local.sh" "$gguf" "$port" >"$dir/serve-$label.log" 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  url=http://127.0.0.1:$port
fi
"$here/llama-speed.sh" "$url"

echo "$(date +%T) $label: evaluating against $url"
FINETUNE_LLAMA_CPP_URL=$url "$here/sample-lanes.sh" "$dir" "$label" -p llamacpp --split val \
  --models "$label" --samples "$samples" --manifest "$MANIFEST" --timeout "${TIMEOUT_MS:-1800000}"
echo "$(date +%T) $label: done, $(cat "$dir"/*.jsonl | grep -c . || true) runs in $dir"
