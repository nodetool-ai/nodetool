#!/usr/bin/env bash
# usage: llama-speed.sh [url]
#
# Waits up to 3 minutes for a llama-server's /health, sends one short
# request, prints the generation speed, and exits 1 when it is at or below
# MIN_TPS tokens per second (default 20). Qwen3.5-9B Q4_K_M runs at about
# 51 tok/s alone on an RTX 3060. A lower figure means another process holds
# the GPU or the model runs partly on the CPU, and eval timings and timeouts
# will not compare. The url defaults to http://127.0.0.1:8090.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in -h | --help) usage; exit 0 ;; esac
url=${1:-http://127.0.0.1:8090}
for _ in $(seq 1 90); do
  curl -sf "$url/health" >/dev/null && break
  sleep 2
done
curl -sf "$url/health" >/dev/null || { echo "no llama-server answers at $url" >&2; exit 1; }
speed=$(curl -s "$url/v1/chat/completions" -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"max_tokens":40}' |
  python3 -I -c 'import json,sys; print(int(json.load(sys.stdin)["timings"]["predicted_per_second"]))')
echo "$url: $speed tok/s"
[ "${speed:-0}" -gt "${MIN_TPS:-20}" ] || { echo "below ${MIN_TPS:-20} tok/s: the GPU is shared or the model is not on it" >&2; exit 1; }
