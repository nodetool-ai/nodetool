# Phase 3: train on Runpod

Goal: an adapter per epoch, a GGUF per checkpoint worth evaluating, all of them
on this machine and checksum-verified, and the pod stopped.

You need `runpodctl` with an API key (the `runpodctl` skill covers setup), an
SSH key pair whose public half goes to the pod, and the operator's approval for
the GPU's hourly rate. The v3 recipe trained Qwen3.5-9B with rank 16, lr 1e-4,
gradient accumulation 8 and a maximum sequence of 65,536 tokens on an 80 GB
H100. On another GPU type, measure first with `seq-probe.py`, or a short
`train.py train --max-steps 2`.

## 1. Bundle and pod

```bash
$S/make-bundle.sh "$FT_HOME/bundle-v4" data/sft.jsonl data/val-sft.jsonl
$S/pod-create.sh nodetool-ft-v4 "EUR-NO-2|NVIDIA H100 80GB HBM3" "US-GA-2|NVIDIA H100 80GB HBM3"
POD=<the POD= value it printed>
$S/pod-upload.sh "$POD" "$FT_HOME/bundle-v4" /workspace/ft-v4
```

`pod-create.sh` puts the pod on a new network volume mounted at `/workspace`.
The model cache, checkpoints and GGUFs live there. The venv, the compile caches
and the llama.cpp build live on the container disk under `/root` and are rebuilt
after a restart. The pod image has no rsync, so the upload and the fetch use tar
over ssh. `pod-upload.sh` verifies every file after the copy.

## 2. Train

```bash
$S/pod-ssh.sh "$POD" 'cd /workspace/ft-v4 && (RUN=v4 EPOCHS=3 nohup ./pod-train.sh > /workspace/run-v4.log 2>&1 < /dev/null &)'
$S/run-detached.sh wait-v4 "$FT_HOME/wait-v4.log" $S/pod-wait.sh "$POD" /workspace/run-v4.log TRAINING-DONE 30
```

`pod-train.sh` runs `train.py selftest` and `check` before training. Read the
start of the log: the render checks, `training on N of M records` (the rest
were longer than `--max-seq`), and later the peak GPU memory. Checkpoints are
saved once per epoch under `/workspace/runs/v4/checkpoints/`, named by step.
An epoch is the record count divided by the gradient accumulation, rounded up:
v3's 391 records made 49 steps, so `checkpoint-147` is epoch 3. `pod-wait.sh`
gives up with exit 3 and leaves the pod running when the log has not grown for
30 minutes. It never stops the pod.

More epochs from a finished checkpoint, with its optimizer state:

```bash
$S/pod-ssh.sh "$POD" 'cd /workspace/ft-v4 && (RUN=v4 EPOCHS=6 RESUME=/workspace/runs/v4/checkpoints/checkpoint-147 nohup ./pod-train.sh > /workspace/run-v4-more.log 2>&1 < /dev/null &)'
```

`EPOCHS` is the new total. The cosine schedule is rebuilt over that total, so
the learning rate rises again after the resume. In v3 it restarted at 2.7e-5
going from epoch 2 to 3, and at 5.4e-5 going from 3 to 6. Epochs 4 to 6 of v3
bought nothing on the eval.

## 3. Loss curve and held-out loss

```bash
$S/pod-ssh.sh "$POD" 'cat /workspace/runs/v4/checkpoints/checkpoint-147/trainer_state.json' > "$FT_HOME/v4-state.json"
python3 -I $S/loss-curve.py "$FT_HOME/v4-state.json"
```

It prints the mean loss per epoch, each learning-rate restart, and a text plot.
Train loss shows convergence only. With `val-sft.jsonl` in the bundle,
`pod-train.sh` ends with `train.py loss --with-base` over every checkpoint and
writes `/workspace/runs/v4/heldout-loss.json`. The log has one `LOSS <name>
<value>` line per model. Run it by hand for other checkpoints:

```bash
$S/pod-ssh.sh "$POD" 'cd /workspace/ft-v4 && HF_HOME=/workspace/hf /root/venv/bin/python train.py loss --data val-sft.jsonl --with-base /workspace/runs/v4/checkpoints/checkpoint-*'
```

A checkpoint whose held-out loss rises while train loss falls has begun to
memorize. Evaluate the checkpoints around the minimum.

## 4. GGUFs

Build llama.cpp once per container start, then quantize each checkpoint and,
once, the base:

```bash
$S/pod-ssh.sh "$POD" '(nohup /workspace/ft-v4/pod-setup-llama.sh > /workspace/setup-llama.log 2>&1 < /dev/null &)'
$S/pod-wait.sh "$POD" /workspace/setup-llama.log SETUP-DONE 20
$S/pod-ssh.sh "$POD" 'B=$(ls -d /workspace/hf/hub/models--Qwen--Qwen3.5-9B/snapshots/*/) &&
  /workspace/ft-v4/quantize.sh /workspace/runs/v4/checkpoints/checkpoint-147 "$B" /workspace/models/v4e3-q4km.gguf &&
  /workspace/ft-v4/quantize.sh --base "$B" /workspace/models/base-q4km.gguf'
```

`pod-setup-llama.sh` installs nvcc from NVIDIA's CUDA 12.8 apt repository,
because the image has none, and builds with `-DGGML_CUDA_NCCL=OFF`, without
which the build fails. It pins the llama.cpp commit every v3 evaluation used.
`quantize.sh` merges in `/dev/shm`, so it needs about 40 GB of RAM. It runs on
the CPU while training holds the GPU. The same scripts run locally with
`LLAMA_CPP_DIR`, `PY` (a venv with torch and safetensors) and `WORK` set to a
directory on disk.

## 5. Fetch, verify, stop

```bash
$S/pod-fetch.sh --stop "$POD" /workspace "$FT_HOME" \
  models/v4e3-q4km.gguf models/base-q4km.gguf runs/v4/adapter runs/v4/checkpoints runs/v4/heldout-loss.json
```

It copies with tar over ssh, compares the size and sha256 of every file on both
sides, rejects empty values, and stops the pod only when every file matches.
On a mismatch it leaves the pod running: fetch again. Fetch everything the next
step needs before stopping, including checkpoints you might resume from.

## When a pod will not come back

A stopped pod restarts on the machine that holds its volume. When that
machine's GPU is taken, `runpodctl pod start` leaves it at `awaiting_container`
for good. Start it without a GPU, copy the files off, then stop it:

```bash
$S/pod-resume.sh "$POD"        # GraphQL podResumeZeroGpu, key from ~/.runpod/config.toml
$S/pod-fetch.sh --stop "$POD" /workspace "$FT_HOME" runs/v4/checkpoints
```

A CPU-only pod can still run `quantize.sh` when llama.cpp's `llama-quantize` is
built there.

## Evaluating on the pod

When the local GPU is busy, the pod can serve a GGUF while the eval lanes run
here: run `serve-local.sh` on the pod with `LLAMA_SERVER=/root/llama.cpp/build/bin/llama-server`
and the same flags, forward the port with `ssh -N -L 18090:127.0.0.1:8090`
(through `run-detached.sh`), and run `eval-model.sh` with
`FT_LLAMA_URL=http://127.0.0.1:18090`. Start the server only once the GPU has
the memory free: training held about 34 GB of the H100. The lanes run the
NodeTool harness on this machine, and v3 waited for 8 GB of free RAM before
starting four of them.

## Check before moving on

- `pod-fetch.sh` printed `POD-STOPPED` and every line was `ok`.
- The held-out loss of the checkpoints you will evaluate is below the base's.
- The bundle, the pod's log and `heldout-loss.json` are kept with the run, so
  the run can be described later.
