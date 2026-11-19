#!/usr/bin/env bash
# usage: quantize.sh <adapter-or-checkpoint-dir | --base> <base-model-dir> <out.gguf>
#
# Builds a GGUF for llama-server: merges the LoRA adapter into the base weights
# (merge_adapter.py), converts the merged model to a bf16 GGUF with llama.cpp's
# convert_hf_to_gguf.py, and quantizes it to Q4_K_M. --base converts the base
# model alone, which gives the GGUF to compare against. Every v3 evaluation
# used Q4_K_M. Keep it, or the scores do not compare. The work runs on the CPU,
# so a pod started without a GPU (pod-resume.sh) can do it.
#
#   quantize.sh /workspace/runs/v4/checkpoints/checkpoint-147 \
#     "$(ls -d /workspace/hf/hub/models--Qwen--Qwen3.5-9B/snapshots/*/)" /workspace/models/v4e3-q4km.gguf
#
# Env:
#   LLAMA_CPP_DIR  a llama.cpp checkout with build/bin/llama-quantize
#                  (default /root/llama.cpp, from pod-setup-llama.sh)
#   PY             python with torch, safetensors, gguf and sentencepiece
#                  (default /root/venv/bin/python)
#   WORK           scratch directory for about 40 GB (default /dev/shm/<name>)
#   QUANT          quantization type (default Q4_K_M)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -eq 3 ] || { usage >&2; exit 2; }
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
adapter=$1 base=$2 out=$3
llama=${LLAMA_CPP_DIR:-/root/llama.cpp}
py=${PY:-/root/venv/bin/python}
name=$(basename "$out" .gguf)
work=${WORK:-/dev/shm/$name}
logs=$(dirname "$out")
mkdir -p "$logs"
rm -rf "$work"
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT

if [ "$adapter" = "--base" ]; then
  model=$base
else
  "$py" "$here/merge_adapter.py" "$adapter" "$base" "$work/merged"
  model=$work/merged
fi
"$py" "$llama/convert_hf_to_gguf.py" "$model" --outtype bf16 --outfile "$work/bf16.gguf" >"$logs/convert-$name.log" 2>&1
"$llama/build/bin/llama-quantize" "$work/bf16.gguf" "$out.part" "${QUANT:-Q4_K_M}" >"$logs/quantize-$name.log" 2>&1
mv "$out.part" "$out"
echo "QUANTIZED $out $(du -h "$out" | cut -f1) sha256 $(sha256sum "$out" | cut -c1-64)"
