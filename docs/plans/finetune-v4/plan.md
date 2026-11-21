# Fine-tuning v4 plan: fix the measurement, fix the harness, then rebuild the data

Goal: a Qwen3.5-9B adapter that completes NodeTool chat tasks reliably in single
requests and in sessions of 20–50 turns, measured by an eval that matches the
product.

Code pointers link to files on `main`. Files that exist only in the open
fine-tuning PR are named as code text: `packages/websocket/src/finetune/`,
`packages/websocket/src/chat-jtbd.ts`, `packages/websocket/scripts/finetune-data.ts`
and `scripts/finetune/train.py`. Line numbers record the code at measurement time
and drift. The traces cited below are the v3 eval and teacher traces, which are
not checked in.

The prompt changes in Phase 1 are recorded in [the chat prompt diet](prompt-diet.md).

## 1. Where we are

Numbers from the validation split (131 tasks, one sample each), measured on the
harness before the Phase 1 fixes. A call counts as an error when its tool result
is an error. The rate depends on that definition: epoch 6 reads 0.37–0.45 and
GLM 0.20–0.27 across the definitions tried, so compare rates only under one
definition.

| Model | Passed | Tool-call error rate | Next call succeeds after an error |
|---|---|---|---|
| Base Qwen3.5-9B | 61 | 0.35 | 0.51 |
| v3 epoch 3 | 84 | 0.41 | 0.45 |
| v3 epoch 6 | 84 | 0.42 | 0.40 |
| GLM teacher (z-ai/glm-5.3-flash) | 115 | 0.26 | 0.60 |

- GLM has two samples per task, which pass 117 and 115 runs.
- Epoch 6 and epoch 3 differ on 44 tasks (+22 −22). Epochs 4–6 bought nothing.
- Error rate by call index, epoch 6 vs GLM: calls 1–5 0.33 vs 0.19, calls 21+
  0.52 vs 0.26. Runs with 21+ replies: epoch 6 passes 11/31, GLM 12/16.
- Short runs fail too. Runs with 1–5 replies pass 42/56 (epoch 6) vs 64/67 (GLM).
- Training set: 391 passing GLM runs, median 6 assistant turns, 37 runs with 20+
  turns, 354 with a single user message. 25% of the teacher's tool calls in it
  return an error, and every assistant turn is a training target.

Trace analysis of the 47 epoch-6 failures (five reviewers, one per family group):

- About 6 fail because of the harness or the grader alone.
- About 16 are model mistakes the harness made likely.
- About 25 are plain model mistakes.

Model failure modes, in order of frequency:

- M1. Claims success that its own readback contradicts (about 18 runs).
- M2. Guesses argument shapes instead of looking up the signature. GLM runs
  `searchTools("select:…")` first in 19 of 32 eval-suite runs, epoch 6 in 1 of 16.
- M3. Repeats a failing call until the 50-reply cap. The reviewers judged the
  decisive mistake to be early, but the first-error index ranges 1–26 and 4 of
  the 15 cap hits passed, so the first error varies.
- M4. Re-runs an action that partly ran, duplicating its effects.
- M5. Import mistakes. Per 100 calls, wrong-module imports are 7.4 vs GLM 1.8 and
  undefined names 4.8 vs 1.4. Dynamic `import()` appears 64 times vs 13.

The data does not show that context length alone causes the long-run failures.
On epoch-6 calls, split by prompt size:

| Prompt size | Error rate after a successful call | After an error |
|---|---|---|
| below 30k | 0.32 | 0.46 |
| 30–40k | 0.36 | 0.69 |
| 40k and above | 0.32 | 0.68 |

The after-error column is confounded by selection, since runs that keep failing
are the ones that grow. The padding control in Phase 2 tests it directly. The
eval has no multi-request sessions, so the 20–50 turn case the product sees has
never been measured.

## 2. Phase 0: fix the graders, the noise floor and the context limit

Every later decision depends on these numbers, so this comes first.

- G1. `no-error-results` (`packages/websocket/src/finetune/tool-loop-jobs.ts`
  lines 61–69, [`tool-loop-eval.ts`](../../../packages/agents/src/evals/tool-loop-eval.ts)
  lines 388–398) fails runs whose errors were caught and recovered. Count only
  errors never followed by a successful call of the same tool, or make the check
  advisory. Both storyboard eval-suite tasks fail for every model, GLM included,
  on this check alone.
- G2. `actually-drawn` ([`jtbd/registry.ts`](../../../packages/agents/src/jtbd/registry.ts)
  lines 421–423) counts only `ui_sketch_stroke`. Use the painted fraction, and
  check that each named layer holds its content.
- G3. `timeline-titles` (`packages/websocket/src/finetune/task-families.ts`
  lines 450 and 470) requires the clip name to equal the title text. GLM's correct
  runs fail it.
- G4. Exact-match strings in `packages/websocket/src/finetune/families/capabilities.ts`:
  the skill description's trailing period (lines 599 and 638) and the memory
  language word "French" (line 499). App outputs are bound only through
  `op:main`, so accept any operation on the task's workflow.
- G5. Context and compaction. The prompt starts at 23.7k tokens and grows about
  650 per reply. GLM reached 76.5k without compacting, while chat compacts at
  0.9 of the window (`COMPACTION_WINDOW_FRACTION` in
  [`chat-compaction.ts`](../../../packages/websocket/src/session/chat-compaction.ts)).
  `scripts/finetune/train.py` drops every record over the maximum sequence of
  65,536 tokens. Sample the teacher with the window forced to 64k, export each
  post-compaction segment as its own record, and report dropped-record counts
  for the existing 391 runs and for every new export.
  Measured: `train.py check --max-seq 65536` drops none of the 391 v3 records
  (longest 64,104 Qwen tokens). Compaction cuts only at a user message, so a
  single-request run never compacts. Segments matter for the sessions in
  Phase 2. Teacher token counts run 0.77–1.14 times the student's, so the
  drop count uses the student's tokenizer.
- Rescore the stored traces where the check can be recomputed from the trace.
  Otherwise re-run.
- Noise: from here on, evaluate with two samples per task (262 runs). Adjacent
  checkpoints flip about 34% of tasks, which gives about 79 discordant pairs
  over 262 runs. A net difference of 12 is only p≈0.18, and about 18 is needed.
  GLM's own resample flips 16/131 (12%), which is the noise floor for a model
  compared with itself.

Exit: graders fixed with a test per change, base / v3e3 / GLM rescored,
dropped-record counts reported, teacher sampling at a 64k window working.

## 3. Phase 1: make the eval environment match the product

Each fix ships with a reproduction test first, as the
[repository rules](../../../AGENTS.md#claims-checks-and-measurements) require.

### 3.1 Tool information

H1–H3 (full descriptions for focused-document tools, no `.slice(0, 6)` on
enums, richer argument shapes) are absorbed by change C9 of the prompt diet in 3.5.

- H4. Zod argument errors name the tool's expected shape, not only the path.

### 3.2 Silent no-ops become errors

- H5. Strict schemas for bridge tools, so unknown keys throw. This covers
  [`evals/surfaces/script.ts`](../../../packages/agents/src/evals/surfaces/script.ts)
  (line 490) and its siblings, `ui_update_node_data` in
  [`workflow-document-tools.ts`](../../../packages/node-sdk/src/workflow-document-tools.ts)
  (lines 514–531), and the js-script test cases in
  [`evals/surfaces/js-script.ts`](../../../packages/agents/src/evals/surfaces/js-script.ts)
  (line 111).
- H6. Optional arguments are type-checked
  ([`capabilities/args.ts`](../../../packages/agents/src/capabilities/args.ts),
  line 169). `memory_update` with nothing to change returns an error that points
  at `memory_delete`
  ([`capabilities/memory.ts`](../../../packages/agents/src/capabilities/memory.ts),
  line 440).
- H7. These return errors: `ui_app_add_component` with an unknown `parent_id`,
  `ui_app_add_operation` with an empty or unknown workflow id, and an audio
  `trim` that changes nothing
  ([`app-build/bridge.ts`](../../../packages/agents/src/app-build/bridge.ts)
  lines 494–527 and 645–690,
  [`evals/surfaces/audio.ts`](../../../packages/agents/src/evals/surfaces/audio.ts)
  lines 150–157).
- H8. A js-script run or test reports validation errors such as
  `js_script_legacy_contract` instead of `ok:true`.

### 3.3 Eval and product parity

- H9. Tools the eval job does not serve answer "X is not open in this job"
  (`packages/websocket/src/chat-jtbd.ts` lines 214–237) while `searchTools` and
  the import surface still list them. Hide them, or make the error list what the
  job serves. The chat turn prefers these client copies
  ([`session/chat-turn.ts`](../../../packages/websocket/src/session/chat-turn.ts)),
  which also hides server tools such as `workflows.open`.
- H10. Focused documents use `${type}-eval` ids with no server row
  (`chat-jtbd.ts` line 114), so every `validate_*` by id fails, and
  [`session/chat-prompt.ts`](../../../packages/websocket/src/session/chat-prompt.ts)
  tells the model to validate by id. Seed the rows.
- H11. Add a model3d focus type (`chat-jtbd.ts` lines 98–108,
  `packages/websocket/src/finetune/task-sets.ts` lines 46–48) so 3D tasks get
  the 3D tool list.
- H12. Workflow edits: expose `update_workflow` and `delete_workflow` through
  `nodetool.workflows` ([`tools/mcp-tools.ts`](../../../packages/agents/src/tools/mcp-tools.ts)
  line 242, [`codeact/nodetool-api.ts`](../../../packages/agents/src/codeact/nodetool-api.ts)
  line 752) and replace the line "There is no update call" in `chat-prompt.ts`.
- H13. `ui_app_list_operations` lists the implicit `main` operation
  (`app-build/bridge.ts` lines 636–641). `ui_app_debug` works against the
  in-memory document, or it leaves the manifest and the prompt.
- H14. One package allowlist for sampling and eval. Training runs had
  `sandbox-dsl` refused, while the eval allows it.
- H15. Images: serve the GGUF with its vision projector, or answer `view_image`
  with a text error when the provider has no image input. Decide which, since it
  sets whether training traces keep image turns.

### 3.4 Recovery support

- H16. When an action throws after N tool calls, the error names the calls that
  ran and says their effects persist
  ([`codeact/chat-codeact.ts`](../../../packages/agents/src/codeact/chat-codeact.ts)
  lines 682–693).
- H17. An undo for audio effects.
- Written alongside the prompt diet and awaiting review: missing-import messages,
  wrong-module hints, revision-conflict details and run-behaviour counters.

### 3.4a Open after the first Phase 1 pass

- H10 needs a document-sync hook per surface: the job writes the bridge's
  document to a server row after each edit. Timeline, JS script and workflow
  bridges can export their document. The sketch bridge cannot yet.
- The browser JS-script tools check run and test results against the
  document-shape issues only. `js_script_legacy_contract` comes from the
  execution validator, which they do not run.
- The headless JS-script tools refuse `input_streams` on a run and
  `inputStreams` in a saved case, which the browser accepts. Share the shapes
  and forward staged streams through the headless runner.
- An audio effect whose range clamps to nothing records an undo step in the
  headless bridge but not in the browser editor.
- `sample` records the requested `--context-window`, not the threshold in
  effect. `NODETOOL_CHAT_COMPACTION_TOKENS` overrides it, so two resumed runs
  can compact at different sizes under the same recorded window.

### 3.5 Prompt diet

The system prompt shrinks from 23.7k to about 8k tokens. The design, with the
section budget, changes C1–C9 and the measured result, is in
[the chat prompt diet](prompt-diet.md). The implementation measures 4,501
tokens for the system message and 1,605 for the provider tools. It must land
before Phase 3 sampling, so the teacher's traces show the lookups the smaller
prompt requires. With an 8k prompt, compaction arrives after about 76 replies
instead of about 52.

The cache invariants are a requirement, and tests pin them. The diet record
gives the detail.

- I1. The system message and the provider tool list are byte-identical for every
  turn of a thread and every focus type.
- I2. History is append-only. Each request's messages are a byte-identical
  prefix of the next request's.
- I3. Per-turn content goes after everything a later request reuses and is
  re-sent only when it changed.
- I4. Compaction may break the prefix once, after which I1–I3 hold again.

Verification:

1. Run GLM on the 131 tasks, two samples, with the new prompt and compare with
   the existing 262 runs (about $4.30). A drop of more than about 10 net of 262
   is real. Bisect C8 and C9 first.
2. Run the base Qwen model on the old and the new prompt. Do not use v3e3,
   which was trained on the old text.

Exit: the four mandatory checks pass, the invariant tests pass, and GLM and
v3e3 are re-evaluated on the fixed harness (two samples each). These become the
new baselines. Expected: GLM rises above 115, v3e3 rises, and the gap that
remains is the model's. The base model is not re-evaluated on the fixed harness.
It runs only in the prompt comparison above.

## 4. Phase 2: a session eval

Without it there is no measurement of the 20–50 turn case.

### 4.1 Padding control

Run this before building sessions. Take about 40 short tasks the student passes
and rerun them with 20k tokens of completed teacher history prepended. It costs
no API credit. If the pass rate holds, context length alone does not hurt and
session failures come from the model's handling of earlier turns. If it drops,
compaction and history shape matter before any session data.

### 4.2 Sessions

- A session is one document and 3–8 user requests drawn from the same family
  generators: build, then edit, rename, reorder, undo a change, refer back to
  earlier content ("make the second shot like the first").
- The grader runs after every request against the stored state. The session
  score is the fraction of requests passed, and whether earlier work survived.
- The scripted user is deterministic. It sends the next request. When a request
  fails its grader, it sends one correction built from the failing check ("Shot
  2 still has no duration"), then moves on. Report the first-attempt score and
  the after-correction score separately.
- Sessions run in one conversation through the real chat turn, including the
  compaction that G5 and the diet settle.
- Size: 40 sessions across the families, frozen like the current validation
  manifest.

Exit: GLM and v3e3 session scores, per-request pass rate by request index, and
the turn at which context fills.

## 5. Phase 3: rebuild the training data

All sampling runs on the Phase 1 harness. The v3 traces are not reused, because
they train calls to tools that do not exist and ids that do not resolve.

### 5.1 Selection

- Select stratified from the samples per task, passing runs only:
  - keep clean runs,
  - keep a quota of runs with one or two errors, each followed by an immediate
    fix,
  - drop runs with an error chain of three or more.
- Reject runs whose final reply claims something the final state contradicts.
  A GLM judge call compares the final reply with the grader outcomes (about
  $0.002 per run). On passing runs alone every final reply is a true success
  claim and this filter rejects almost nothing, so 5.4 adds runs that exercise
  it.
- Keep repeated-call and dynamic-import counters below set limits per run.

### 5.2 Loss masking

- Export marks each assistant turn whose tool result is an error. `train.py`
  excludes those spans from the loss and keeps them in the context. The student
  sees the recovery and learns it, without learning the call that failed.
- Keep exploration calls that succeed (`searchTools`, reads) as targets.

### 5.3 Coverage

Target counts per family after selection, with the gaps filled first:

| Family | v3 runs | Target |
|---|---|---|
| workflow-edit | 1 | 25 |
| workflow-organize | 4 | 25 |
| app-build, app-edit with variables | 11, 2 | 25, 15 |
| storyboard screenplay from a brief | 5 | 20 |
| sketch with brush strokes | 0 | 15 |
| all other families | 13–31 | 20–30 |

### 5.4 Targeted behaviours

- Recoverable fault injection: in 15% of sampled runs, the harness perturbs one
  tool result. Inject only faults the product can produce (a stale revision, a
  partial apply). Do not inject a silently ignored value, which contradicts the
  strict-schema fixes in 3.2. Keep teacher runs that notice on readback and
  repair. This targets M1 and M4.
- Honest failure: in 10–15% of runs the task cannot be completed, through an
  unrecoverable injected fault or a missing resource. The target reply says what
  failed. Grade these runs on the reply, with the judge call from 5.1, not on
  the task grader.
- Signature lookup: the teacher prompt for sampling is unchanged, but selection
  prefers runs that look up before the first write (M2). The diet's smaller
  prompt makes the lookups necessary.

### 5.5 On-policy data

Run the student on the fixed harness, cut each run at its first error, let GLM
continue from that state, and keep the passing continuations. It costs a few
dollars at about $0.0017 per teacher reply. Do this before any DPO.

### 5.6 Sessions

- Sample 200 sessions with the Phase 2 generator, outside the frozen eval
  sessions, with the same selection, masking and judge.
- An LLM paraphrases the user turns in training sessions once, and the result
  is frozen. The eval keeps its deterministic script.
- Mix: about 60% single-request runs and 40% sessions by token count.

### 5.7 Budget

- Single requests: about 30 families × 25 tasks × 3 samples at about $0.016 per
  run, so about $36.
- Sessions: 200 × 3 samples at about $0.10–0.15 per session, so about $60–90.
- Judge: under $5.
- Local eval time is the binding constraint. One 131-task student pass takes
  4.6–5.9 h on one RTX 3060, and the Phase 1 exit as first planned (three
  models × two samples) takes about 30 h.

## 6. Phase 4: train and select

- Same recipe as v3 (rank 16, lr 1e-4, maximum sequence 65,536), 3 epochs, on a
  rented GPU with persistent storage. Copy the results off and verify their
  checksums before the instance stops.
- Select checkpoints by held-out loss on GLM validation traces (`train.py loss`)
  and by the two-sample eval, not by train loss.
- Validation shares generators with training, so it does not measure transfer.
  Treat the 16 eval-suite tasks (epoch 6 passes 9/16) as the transfer measure,
  or add held-out families.
- Ablation, mandatory: the same data without sessions, to measure what sessions
  add. The dropped base-model re-evaluation (3.5) pays for it.

## 7. Phase 5: decide

v4 replaces v3e3 when, on the Phase 1 harness, with a task-clustered bootstrap
and a margin set before the run, on both the single-request metric and the
session metric:

- single-request pass rate is higher by more than the margin over 262 runs,
- session per-request pass rate is higher by more than the margin,
- error rate per call, repeated calls and false success claims are lower,
- the transfer measure from Phase 4 does not drop.

The noise figures in Phase 0 set how large the margin must be.

## 8. Risks and open questions

- Q1. v3 adapters were trained on the old tool text and prompt, so v3e3 may drop
  on the new harness even as the harness improves. That is why the prompt
  comparison in 3.5 uses the base model.
- Q2. Loss masking may hide useful exploratory calls whose error is the expected
  outcome (a probe). Count how many masked calls are deliberate probes before
  committing.
- Q3. Fault injection and honest-failure setups must stay out of the eval and out
  of production code paths.
- Q4. GLM is the ceiling. Families where GLM fails after Phase 1 need a stronger
  teacher, or the task is wrong.
