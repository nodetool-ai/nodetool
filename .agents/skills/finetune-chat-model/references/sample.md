# Phase 1: sample teacher runs

Goal: a JSONL file of teacher runs, each graded by its task's checks, recorded
at the wire through the real chat turn.

## Prepare

1. Put the Node version from `.nvmrc` first on `PATH`, `unset DISPLAY`, and
   run `npm run build:packages`.
2. Write the browser tool manifest:

   ```bash
   $S/dump-tool-manifest.sh "$FT_HOME/manifest.json"
   ```

   The manifest is the `ui_*` tool list a real browser session registers with
   the server, as `FrontendToolRegistry.getManifest()` returns it after every
   tool in `web/src/lib/tools/builtin/` has registered. The script runs a
   temporary Jest test in `web/` that writes it, then deletes the test. The v3
   manifest held 216 tools. Without `--manifest` the prompt lists only the
   task's own tools and is shorter than production's. Regenerate it when a
   `ui_*` tool changes, and use the same file for the teacher and for every
   evaluation of models trained on that data.
3. Ask the operator for the path of the file that holds the OpenRouter key, and
   export it as `FINETUNE_OPENROUTER_KEY_FILE`. Do not read the file or echo
   the key.

## Choose the tasks

```bash
$S/ft-data.sh tasks --generated 30 > data/tasks.txt   # id, surface, request
```

There are three kinds: jobs to be done, `tool-loop` eval cases, and
`gen/<family>/<nnn>` tasks from the seeded families. `--generated N` must be the
same number for `tasks` and `sample`: an id the sampler does not generate is
skipped without a message. Validation tasks never appear in the training split.

Split the chosen ids into two lanes. Each lane is one sampler process:

```bash
python3 -I $S/make-lanes.py --tasks-file data/tasks.txt --match '^gen/(sketch|svg|audio)-' \
  --lanes 2 --out-dir data/glm-pass3
```

## Smoke-test, then sample

Run two or three tasks first, with a small budget, and read every line:

```bash
$S/ft-data.sh sample -p openrouter --models z-ai/glm-5.3-flash --generated 30 \
  --tasks gen/svg-edit/000,gen/memory-edit/001 --budget 0.3 \
  --manifest "$FT_HOME/manifest.json" --out data/smoke.jsonl
```

Each run prints one line:
`PASS z-ai/glm-5.3-flash gen/sketch-compose/001 0 62s requests=10 calls=13 maxPrompt=27336 stops=… cost=$0.0168 total=$0.02 repeated=… refErrors=… importErrors=… unknownOps=… revConflicts=…`.
Look for `error=` at the end of a line and for `Error:` lines in the log. Those
are harness failures, not model failures.

Then start both lanes detached, after the operator approved the cost:

```bash
$S/run-detached.sh glm-pass3 data/glm-pass3/run.log \
  $S/sample-lanes.sh data/glm-pass3 glm -p openrouter --models z-ai/glm-5.3-flash \
    --generated 30 --samples 3 --temperature 0.8 --budget 5 --manifest "$FT_HOME/manifest.json"
```

- Cost and time. A GLM-5.3-flash run costs about $0.016 and takes about 76 s.
  One lane runs one task at a time, so two lanes halve the wall time. The v4
  plan's single-request set, 30 families × 25 tasks × 3 samples, comes to
  about $36.
- `--budget` is in US dollars and counts per lane, over the runs already in that
  lane's `--out` file.
- The sampler appends one line per run and skips a (model, task, sample) it
  already has, so a stopped lane restarts where it left off.
- `--samples` and `--temperature` give several different passing runs per task
  to select from.

Local models sample the same way: `-p ollama --models qwen3.5:9b` with
`OLLAMA_THINK=false`, or `-p llamacpp` against `serve-local.sh` with
`FINETUNE_LLAMA_CPP_URL`.

## Check before moving on

- `sample-lanes.sh` exited 0 and printed a pass and fail count for each lane.
- The pass rate per family is plausible:
  `python3 -I $S/compare.py glm='data/glm-pass3/glm-l*.jsonl'`. A family
  that the teacher always fails has a wrong grader or a harness gap. Fix that
  before sampling more of it.
- `maxPrompt` stays below the training `--max-seq` (65,536). `train.py` drops
  longer records.
- The spend matches the estimate (`total=` on the last line of each lane log).
