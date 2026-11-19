#!/usr/bin/env bash
# usage: make-bundle.sh <bundle-dir> <sft.jsonl> [val-sft.jsonl] [--resume <checkpoint-dir>]
#
# Assembles what a training pod needs in one directory: the training data,
# scripts/finetune/{train.py,ollama_qwen35.py,requirements.txt} from this
# repository, and this skill's pod-side scripts (pod-train.sh, merge_adapter.py,
# quantize.sh, pod-setup-llama.sh). With --resume it also copies a Trainer
# checkpoint, with its optimizer state, to continue from. Upload the result
# with pod-upload.sh. Prints the files and their sha256.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=${NODETOOL_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
bundle=$1 sft=$2
shift 2
val="" resume=""
while [ $# -gt 0 ]; do
  case "$1" in
    --resume) resume=$2; shift 2 ;;
    *) val=$1; shift ;;
  esac
done
[ -s "$sft" ] || { echo "no training data at $sft" >&2; exit 1; }
mkdir -p "$bundle"
cp "$sft" "$bundle/sft.jsonl"
[ -z "$val" ] || cp "$val" "$bundle/val-sft.jsonl"
cp "$repo"/scripts/finetune/{train.py,ollama_qwen35.py,requirements.txt} "$bundle/"
cp "$here"/{pod-train.sh,merge_adapter.py,quantize.sh,pod-setup-llama.sh} "$bundle/"
if [ -n "$resume" ]; then
  [ -f "$resume/trainer_state.json" ] || { echo "$resume is not a Trainer checkpoint" >&2; exit 1; }
  cp -r "$resume" "$bundle/"
fi
(cd "$bundle" && find . -type f | LC_ALL=C sort | xargs sha256sum)
