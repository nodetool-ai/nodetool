# Fine-tuning a local model for NodeTool chat

This folder trains a local model on NodeTool's own product chat. The data comes
from graded runs: a model takes a task through the real chat turn, the task's
checks grade the world it left behind, and only runs that pass become training
records. Training is QLoRA with [Unsloth](https://unsloth.ai/docs/models/gemma-4/train).
The result is a GGUF that Ollama serves.

The operations around this code (sampling lanes, Runpod training, GGUF
export, local evaluation, the paired comparison and the trace analysis) are the
[finetune-chat-model](../../.agents/skills/finetune-chat-model/SKILL.md) skill.

The default profile, `qwen35`, trains `Qwen/Qwen3.5-9B` for Ollama's
`qwen3.5:9b`. The `gemma4` profile trains
`unsloth/gemma-4-12B-it-qat-q4_0-unquantized`, the bf16 weights behind
`gemma4:12b-it-qat`.

## 1. Generate data

`packages/websocket/scripts/finetune-data.ts` drives each task through
`WebSocketClientSession`, which uses the same system prompt, CodeAct
`execute_code` and `ui_*` bridge as a real browser session. It records every
model request and reply at the wire: Ollama's `/api/chat`, or `/chat/completions`
for a teacher on OpenRouter.

There are three kinds of task:
- the [jobs to be done](../../docs/harnesses.md#nodetool-jtbd-jobs-to-be-done--the-optimization-loop);
- the `tool-loop` eval cases that the chat path can run;
- `--generated N` tasks from each family in
  `packages/websocket/src/finetune/task-families.ts` and `families/`. The
  families cover the browser editors (3D, SVG, timeline, sketch, audio,
  storyboard, script, JS script, mini app) and the agent's server
  capabilities (workflows, memory, skills). A capability task seeds a new
  user's rows in the test database and grades what the turn left there.

A family turns a seed into one task: the request, the starting document, and
checks over the result. Different parameters ask for different work, such as
other objects, timings or edits. Each family has a reference solution, and
`tests/task-families.test.ts` proves that for every family the solution passes
the checks and an untouched world fails them. A new family needs both. Tasks
are deterministic from the seed, so an id such as `gen/svg-edit/007` always
names the same task.

```bash
T="npx tsx packages/websocket/scripts/finetune-data.ts"
$T tasks --generated 30                                  # what can run
$T sample -p openrouter --models z-ai/glm-5.3-flash --generated 30 --budget 10 \
  --manifest manifest.json --out data/traces.jsonl       # teacher runs
$T sample --models qwen3.5:9b --generated 30 --samples 2 --temperature 0.8 \
  --manifest manifest.json --out data/traces-local.jsonl # local runs
$T export --traces data/traces.jsonl --out data/sft.jsonl
```

- `-p openrouter` reads the key from the file named by
  `FINETUNE_OPENROUTER_KEY_FILE`. The sampler refuses to start while any
  provider key is in the environment. The run's own tools are real server
  tools: with a key in reach, a model under test once started paid video
  generations. `--budget` stops sampling at that many US dollars of teacher
  cost.
- `sample` appends one line per run and skips runs already in the file, so
  it can be stopped and restarted. Teachers may sample with thinking on: the
  thoughts are dropped and every record is rendered again for training. Set
  `OLLAMA_THINK=false` for the runs that check the render and for every
  measurement, because that is how the fine-tuned model runs.
- `--manifest` takes the browser's full `ui_*` manifest. Without it, the prompt
  lists only the task's own tools and is shorter than a real session's.
- `--context-window <tokens>` sets the window the chat turn compacts against.
  Pass the student's serving window (65,536 in `serve-local.sh`), so a long
  session compacts where the student's would.
- `sample` refuses to start when the installed sandbox catalog serves other
  packs than `packages/websocket/scripts/finetune-sandbox-packs.json`, because
  a session's package allowlist comes from that catalog. Rewrite the pin with
  `packs` only after a deliberate change.
- `export` keeps a run only if all of these hold:
  - its checks passed;
  - it ended with a text reply;
  - each request replays what the model said earlier in its stretch.

  A compaction rewrites the history, so `sample` records the last request
  before each one, and `export` writes one record per stretch between
  compactions. It also drops records that duplicate another run's output, and
  every run of a validation task (see [Measure](#4-measure)).

Use teachers whose licence allows training on their output. Gemma, Qwen and
gpt-oss allow it. Do not use the `claude_agent_sdk` provider without checking
first: it runs on a Claude subscription, and section 3 of
[Anthropic's consumer terms](https://www.anthropic.com/legal/consumer-terms)
restricts using the services "to develop or train any artificial intelligence
or machine learning algorithms or models".

## 2. Check the render

```bash
python scripts/finetune/train.py selftest
python scripts/finetune/train.py check --data data/sft.jsonl
```

`selftest` proves the loss mask on a fixed record. `check` renders every record
and compares its prompt length with the count Ollama reported for the same
request. It only compares records sampled with `OLLAMA_THINK=false`. A delta of
zero means training and inference see the same tokens.

**Render.** The records are rendered with Gemma 4's non-thinking template, and
inference must run with `OLLAMA_THINK=false`:
- With thinking on, Ollama removes each step's thought from the history before
  the next request. So no single rendered conversation matches what the model
  saw at every step.
- With thinking off, it does. The one exception is the empty thought channel
  that Ollama adds to the first step's prompt. The training text keeps that
  channel as context.

The provider also sends `tool_name` on every tool result, because the template
renders it. Ollama's Gemma 4 renderer leaves out of a tool declaration any
property named `description`, `type`, `properties`, `required` or `nullable`,
so it never shows the model `execute_code`'s `description` argument. The
training render drops the same properties.

**Mask.** Gemma 4 places tool results inside the model's turn, and the model
stops by emitting `<|tool_response>`. The mask trains the model on everything it
writes, that stop token included. It never trains on a tool result.
Unsloth's `train_on_responses_only` would also train the tool results, so
`train.py` builds its own mask.

## 3. Train and export

```bash
python -m venv venv && venv/bin/pip install -r scripts/finetune/requirements.txt
venv/bin/python scripts/finetune/train.py train --data data/sft.jsonl --out runs/v1
venv/bin/python scripts/finetune/train.py export --adapter runs/v1/adapter --out runs/v1/gguf --quant q4_0
```

Records are as long as a chat turn: a turn's first request is already about
21k Gemma tokens. `train` drops any record longer than `--max-seq`, and
`check --max-seq` counts those records in advance (`over_max_seq`). Whether a
12B model fits that length on a given GPU is measured, not assumed. Run
`train` once with a few records and watch the memory before a full run.

To serve the model, write a Modelfile whose `FROM` is the exported GGUF and
copy the rest from `ollama show gemma4:12b-it-qat --modelfile`. That keeps the
renderer, the parser and the parameters. Then run `ollama create`.

## 4. Measure

Measure on the validation split, never on training tasks. It holds out two
kinds of task:
- five generated tasks per family, drawn from their own seed under ids such as
  `val/svg-edit/003`;
- one in three jobs-to-be-done and tool-loop eval cases, chosen by a hash of the
  task id, so tasks the generator cannot produce are measured too.

Training sampling skips any task whose id or request matches a validation
task, and `export` rejects their runs as `validation`. The split is frozen in
`packages/websocket/scripts/finetune-validation-set.json`.
`tests/finetune-validation.test.ts` fails when the code would generate a
different split or when a training task shares an id or request with it. After
adding a family on purpose, write the manifest again with `$T valset`.

Run each model on the split with `OLLAMA_THINK=false` and compare pass rates
per family:

```bash
$T sample --split val --models qwen3.5:9b,nodetool-qwen35:v2 --out data/val.jsonl
```

`--split val` refuses to run if the generated split no longer matches the
manifest. A model trained before a task was held out has seen it, so its score
on that task does not count.
