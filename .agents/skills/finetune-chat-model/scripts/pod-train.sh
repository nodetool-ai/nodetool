#!/usr/bin/env bash
# usage (on the pod, inside the uploaded bundle):
#   RUN=<name> [EPOCHS=2] [RESUME=<checkpoint dir>] ./pod-train.sh
#
# Installs the training venv on the container disk, downloads the base model
# to the network volume, proves the render and the loss mask (train.py
# selftest and, for a fresh run, check), then trains with QLoRA. Checkpoints
# (one per epoch) and the adapter go to /workspace/runs/$RUN, on the network
# volume. The log ends with TRAINING-DONE, which pod-wait.sh waits for.
#
# RESUME continues from a Trainer checkpoint with its optimizer state. Set
# EPOCHS to the new total, above the epochs the checkpoint finished. The
# cosine schedule is rebuilt over the new total, so the learning rate rises
# again after the resume instead of continuing the old decay. The v3 run from
# epoch 2 to 3 restarted at 2.7e-5, and from 3 to 6 at 5.4e-5.
#
# Env: RUN (required), EPOCHS (2), RESUME, PROFILE (qwen35, see train.py),
#      BASE (default: the profile's checkpoint), MAX_SEQ (65536), LR (1e-4),
#      RANK (16), GRAD_ACCUM (8)
#
# Start it detached on the pod:
#   cd /workspace/ft-<run> && (RUN=<run> nohup ./pod-train.sh > /workspace/run-<run>.log 2>&1 < /dev/null &)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in -h | --help) usage; exit 0 ;; esac
: "${RUN:?set RUN to the run name}"
cd "$(dirname "${BASH_SOURCE[0]}")"
export HF_HOME=/workspace/hf
export TMPDIR=/root/tmp TORCHINDUCTOR_CACHE_DIR=/root/inductor TRITON_CACHE_DIR=/root/triton
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
out=/workspace/runs/$RUN
mkdir -p "$TMPDIR" "$out/checkpoints"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
cuda=$(nvidia-smi | grep -oE "CUDA Version: [0-9]+" | grep -oE "[0-9]+$")
echo "driver supports CUDA $cuda"

python3 -m pip install -q --break-system-packages uv 2>/dev/null || python3 -m pip install -q uv
[ -x /root/venv/bin/python ] || python3 -m uv venv -q --python 3.12 /root/venv
PY=/root/venv/bin/python
python3 -m uv pip install -q --python $PY -r requirements.txt flash-linear-attention==0.6.0
if [ "$cuda" -lt 13 ]; then
  # The pinned torch is the CUDA 13 build. An older driver needs the 12.8 build
  # of the same version. xformers is built against the CUDA 13 torch, and
  # Unsloth runs without it.
  python3 -m uv pip install -q --python $PY --reinstall torch==2.14.1 --index-url https://download.pytorch.org/whl/cu128
  python3 -m uv pip uninstall -q --python $PY xformers
fi
$PY -c "import torch; print('torch', torch.__version__, 'cuda ok', torch.cuda.is_available())"

profile=${PROFILE:-qwen35}
base=${BASE:-$($PY -c "import sys; sys.argv=['x']; import train; print(train.PROFILES['$profile'].base)")}
$PY -c "import sys; from huggingface_hub import snapshot_download; snapshot_download(sys.argv[1])" "$base"
$PY train.py selftest --profile "$profile"
resume_args=()
if [ -n "${RESUME:-}" ]; then
  # Later checkpoints land beside the one resumed from.
  name=$(basename "$RESUME")
  [ -d "$out/checkpoints/$name" ] || cp -r "$RESUME" "$out/checkpoints/"
  done_epochs=$($PY -c "import json,sys; print(json.load(open(sys.argv[1]))['epoch'])" "$out/checkpoints/$name/trainer_state.json")
  $PY -c "import sys; sys.exit(0 if float(sys.argv[2]) > float(sys.argv[1]) else 1)" "$done_epochs" "${EPOCHS:-2}" ||
    { echo "EPOCHS=${EPOCHS:-2} must exceed the $done_epochs epochs $name finished" >&2; exit 1; }
  resume_args=(--resume "$out/checkpoints/$name")
else
  $PY train.py check --profile "$profile" --max-seq "${MAX_SEQ:-65536}" --data sft.jsonl
fi
$PY train.py train --profile "$profile" --base "$base" --data sft.jsonl --out "$out" \
  --max-seq "${MAX_SEQ:-65536}" --epochs "${EPOCHS:-2}" --grad-accum "${GRAD_ACCUM:-8}" \
  --lr "${LR:-1e-4}" --rank "${RANK:-16}" "${resume_args[@]}"
if [ -s val-sft.jsonl ]; then
  $PY train.py loss --profile "$profile" --base "$base" --data val-sft.jsonl --with-base \
    --out "$out/heldout-loss.json" "$out"/checkpoints/checkpoint-*
fi
echo TRAINING-DONE
