#!/usr/bin/env bash
# usage: ft-data.sh <tasks|sample|export|valset> [finetune-data.ts options]
#
# Runs packages/websocket/scripts/finetune-data.ts from this repository with a
# clean environment: every provider key and DISPLAY unset, temp files in
# $FT_HOME/tmp instead of /tmp. A sampled run's tools are real server tools,
# so a key in reach lets the model under test spend money.
#
# A teacher on OpenRouter (-p openrouter) reads its key from the file that
# FINETUNE_OPENROUTER_KEY_FILE names. The operator supplies that path.
# -p llamacpp needs FINETUNE_LLAMA_CPP_URL, for example http://127.0.0.1:8090.
#
# It runs from the repository root, so relative paths in the options resolve
# against the root. Env: FT_HOME (default ~/.cache/nodetool-finetune),
# NODETOOL_REPO (default: the repository holding this script). Node must match
# .nvmrc.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=${NODETOOL_REPO:-$(git -C "$here" rev-parse --show-toplevel)}
want=$(cut -d. -f1 < "$repo/.nvmrc")
have=$(node -p 'process.versions.node.split(".")[0]')
if [ "$have" != "$want" ]; then
  echo "Node $have is first on PATH; put Node $(cat "$repo/.nvmrc") first" >&2
  exit 1
fi
export TMPDIR=${FT_HOME:-$HOME/.cache/nodetool-finetune}/tmp
mkdir -p "$TMPDIR"
unset DISPLAY OPENROUTER_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY \
  FAL_API_KEY REPLICATE_API_TOKEN ELEVENLABS_API_KEY KIE_API_KEY HF_TOKEN
cd "$repo"
exec npx tsx packages/websocket/scripts/finetune-data.ts "$@"
