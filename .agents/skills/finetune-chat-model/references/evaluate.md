# Phase 4: evaluate on llama.cpp

Goal: each candidate GGUF run on the frozen validation split, two samples per
task, and a paired comparison with the current checkpoint and the teacher.

## llama.cpp

Build llama-server once, with CUDA, at the commit the v3 evaluations used, and
with `TMPDIR` on disk because nvcc fills a small `/tmp`:

```bash
git clone https://github.com/ggml-org/llama.cpp "$FT_HOME/llama.cpp"
cd "$FT_HOME/llama.cpp" && git checkout d3c3e242c16b8cbf51400fad410cd69b22d64f35
TMPDIR=$FT_HOME/tmp cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86 \
  -DLLAMA_CURL=OFF -DGGML_CUDA_NCCL=OFF -DCMAKE_BUILD_TYPE=Release
TMPDIR=$FT_HOME/tmp cmake --build build -j8 --target llama-server llama-quantize
```

Set `CMAKE_CUDA_ARCHITECTURES` to the GPU's compute capability without the dot
(86 for an RTX 3060). Ollama's llama-server binary can stand in through
`LLAMA_SERVER`, but compare results only between runs served by one build.

`serve-local.sh` fixes the template and sampling: `--jinja` with thinking off,
temperature 1.0, top-k 20, top-p 0.95, presence penalty 1.5. Do not change
these flags, or the result does not compare with earlier runs. Serve with
`CTX=131072 NP=2`: two slots of 64k, one per lane. `llama-speed.sh` must report
more than 20 tok/s, about 51 on an RTX 3060 alone. A lower figure means another
process holds the GPU.

## Run an evaluation

```bash
MANIFEST=$FT_HOME/manifest.json SAMPLES=2 $S/run-detached.sh eval-v4e3 nodetool-debug/finetune/eval-v4e3/eval.log \
  $S/eval-model.sh v4e3 "$FT_HOME/models/v4e3-q4km.gguf" nodetool-debug/finetune/eval-v4e3
```

`eval-model.sh` splits the tasks that are not done into two lanes, starts the
server, checks the speed, runs both lanes with `-p llamacpp --split val`, and
stops the server. It refuses to start when another server already answers on
its port. A rerun skips finished tasks, so after a crash or a reboot, run the
same command again. Results land in `<eval-dir>/v4e3-l0.jsonl` and `-l1.jsonl`.

- One 131-task pass takes 4.6 to 5.9 hours on one RTX 3060. Two samples double
  it. Evaluate models one after another on one GPU: chain the
  `eval-model.sh` calls in one `bash -c '… && …'` under `run-detached.sh`.
- Without a systemd user manager, `run-detached.sh` falls back to `setsid
  nohup` and writes a pid file. Check it with `kill -0`.
- Never stop servers with `pkill -x llama-server`: it also kills a server
  another job is using. Stop the job, and its server goes with it.

## Compare

```bash
D=nodetool-debug/finetune
python3 -I $S/compare.py "base=$D/eval-base/*.jsonl" "glm=$D/teacher-val/*.jsonl" \
  "v3e3=$D/eval-v3e3/*.jsonl" "v4e3=$D/eval-v4e3/*.jsonl" --candidate v4e3
python3 -I $S/significance.py "v3e3=$D/eval-v3e3/*.jsonl" "v4e3=$D/eval-v4e3/*.jsonl"
python3 -I $S/significance.py --resample "glm=$D/teacher-val/*.jsonl"
```

`compare.py` prints, per run, the passes and the mean behaviour counters
(repeated calls, ReferenceErrors, refused imports, unknown storyboard ops,
revision conflicts). Then it lists the candidate's wins and losses per task
against every other run, and passes per family. `--list` adds every task's
result per run. Each task keeps its highest sample.

`significance.py` pairs runs on task and sample. It prints the discordant
pairs, an exact McNemar p-value, and a bootstrap over tasks of the net
difference. It resamples tasks, not runs, because two samples of one task are
not independent. `--resample` measures one model against itself.

Read the result against the v3 noise:

- About 30-34% of tasks flip between adjacent checkpoints. v3 epoch 6 against
  epoch 3 is +22 -22 on 131 tasks.
- GLM against itself flips 16 of 131 tasks (117 and 115 passes).
- With two samples per task there are about 79 discordant pairs in 262 runs. A
  net difference of 12 is only p≈0.18. About 18 is needed.

Set the margin before the run, and report the bootstrap interval, not only the
pass count. To check the scripts and the data, the v3 files reproduce base
61/131, v3e3 84, v3e6 84 and GLM 115 (its sample 1).

## Check before moving on

- Every lane log ends without a stack trace, and each model has a run for every
  task (`compare.py` prints the task count per run).
- The comparison uses runs from one harness commit and one manifest.
- The decision names the paired statistic and its interval.
