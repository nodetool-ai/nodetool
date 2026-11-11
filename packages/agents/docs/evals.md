# Eval suites

**Navigation**: [Agents package rules](../AGENTS.md) → **Eval suites**

Paths are relative to `packages/agents/` unless they name another package.

## Graph authoring eval suite (`graph-planner`)

`src/evals/` carries a provider-agnostic evaluation harness for graph
authoring: `GRAPH_PLANNER_EVAL_CASES` (objectives + structural expectations —
input wiring, node-family patterns, branch handles, reachability, prompt text,
no provider-locked nodes) and `runGraphPlannerEval`, which drives
`authorGraph` (metrics per case: accepted, score, authoring rounds, tool
calls, duration, cost; aggregate: success rate, one-shot rate, averages). Run it
against any registered provider:

Two metrics were mapped when the suite moved off the retired one-shot planner:
**authoring rounds** replaces submit rounds and counts `execute_code` actions,
so a one-shot is a graph delivered in the first action; **attempts** is gone,
because `authorGraph` has no outer retry loop — a repair is another authoring
round.

```bash
npm run dev:nodetool -- eval graph-planner --list
npm run dev:nodetool -- eval graph-planner -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-planner -p ollama -m qwen-3.5:4b --cases summarize
npm run dev:nodetool -- eval graph-planner -p openai -m gpt-5.4-mini --json --out report.json
npm run dev:nodetool -- eval graph-planner -p anthropic -m ... --min-success 0.8  # floor
```

**Where the suites run.** On request. `.github/workflows/agent-eval.yml`
(`workflow_dispatch` only) runs the suites that need a provider, plus `jtbd`,
against inputs for suites/provider/model/cases and a floor override, uploads
each suite's JSON, and renders one table. Nothing here gates a merge: a model
run costs money and carries run-to-run variance, so it is a tool a maintainer
starts after changing the planner, the CodeAct loop, the sub-agent path or a
`ui_*` contract. The free half is a local command — `nodetool eval <suite>
--keyless` runs the cases that need no key and no network, and `--list` marks
them.

Harness tests (scripted provider, no network): `tests/graph-planner-eval.test.ts`.

## End-to-end eval suite (`graph-e2e`)

The `graph-planner` suite stops at the graph: it scores structure, which says
nothing about whether the workflow does what was asked. `src/evals/graph-e2e-
{cases,eval}.ts` closes that loop — every case runs three phases and only counts
as a success when all three hold:

1. **plan** — `authorGraph()` produces a graph, scored structurally by the
   same `checkExpectations` the graph-planner suite uses.
2. **execute** — `applyRunPolicy` (`src/run-policy.ts`) stamps the run's
   provider/model onto the planner's Agent nodes (the planner leaves them
   model-less on purpose — the run owns that choice — so an unstamped graph
   dies on "Select a model"). This suite is its only importer, and the reason
   the function outlived the retired `Agent` graph branch,
   then the graph runs for real with the case's inputs as run params, through a
   caller-supplied `GraphRunner`. The runner is injected so this package needs
   no execution dependency and the harness tests can drive scripted runs with
   no kernel; the CLI wires the real one over `ExecutionSession`
   (`packages/cli-harness/src/evals/graph-runner.ts`).
3. **judge** — deterministic output checks (an output by name exists, is
   non-empty, matches/doesn't match a literal) plus an LLM judge
   (`src/evals/goal-judge.ts`) that reads the case's goal statement and the
   actual outputs and answers `{achieved, score, reasoning}` as plain JSON. A
   regex cannot tell a real German translation from the English echoed back;
   the judge can. A provider failure or unparseable answer is reported as a
   judge error, never as a pass.

Metrics per case: planned, executed, goalAchieved, score, submit rounds, node/
edge counts, plan and run duration, cost, plus the outputs themselves.
Aggregate: end-to-end success rate (the `--min-success` gate), plan rate,
execution rate, mean score. Cases whose graph needs a real model
(`needsModelProviders`) skip without configured providers; the two deterministic
cases (`concat`, `arithmetic`) run anywhere and use `skipJudge`, since their
outputs are pinned exactly by pattern.

Each case costs inference twice — the run, then the judge — so it is the most
expensive suite here. A full pass on `claude_agent_sdk`/`sonnet` runs ~$0.07.

```bash
npm run dev:nodetool -- eval graph-e2e --list
npm run dev:nodetool -- eval graph-e2e -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-e2e -p openai -m gpt-5.4-mini --cases concat,arithmetic
npm run dev:nodetool -- eval graph-e2e -p anthropic -m ... --timeout 600000 --min-success 0.8
```

Harness tests (scripted provider, fake runner, no network):
`tests/graph-e2e-eval.test.ts`.

## Code node authoring eval (`code-gen`)

`src/evals/code-gen-{cases,eval}.ts` drives the real `CodePlanner` over eight
cases — one per authoring shape the feature targets (reshape, merge/join,
compute, extract/parse, split, format, validate, seed) — and scores each
accepted `submit_code` submission structurally: declared outputs present and
typed, inputs limited to the slots the dialog offered, the destination-handle
case's expected output present with the right type, every declared output
assigned on every visible return path (`analyzeGeneratedCode`), no `state`/
`yield` when nobody asked, and no name that is neither sandbox API
(`unknownApiReferences`) nor bound by the code itself (`collectBoundNames`).

Acceptance is reported twice: **first-pass** (accepted on round 1, before the
tool fed anything back) and **post-repair** (accepted at all within the round
cap). `--min-success` gates on post-repair.

```bash
npm run dev:nodetool -- eval code-gen --list
npm run dev:nodetool -- eval code-gen -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval code-gen -p openai -m gpt-5.4-mini --min-success 0.9
```

Harness tests (scripted provider, no network): `tests/code-gen-eval.test.ts`.

## Planning-mode eval suite (`task-planner`)

The graph-planner suite covers graph mode. The task planner has a suite of its
own, scoring the *plan* statically — nothing is executed.

**`task-planner`** runs `TaskPlanner.planMultiTask` and scores the committed
`TaskPlan`. `PlanBuilder` already rejects structurally broken plans (duplicate
step ids, dangling deps, cycles), so anything that comes back is valid by
construction; what it cannot judge is quality, and that is the suite:
parallel width, decomposition proportional to the objective, real dependencies
modelled as dependencies, tool routing (`run_python` for arithmetic, not a
reasoning step), the step-id prefix convention, and the prompt's hard rule that
final synthesis belongs to the loop that ran the plan, not to an "assemble"
task. Metrics per
case: tasks, steps, parallel width, critical-path depth, planner tool calls,
rejected `add_task`/`finish_plan` calls; aggregate adds a **clean rate** — the
fraction of plans built without a single rejected call.

Cases + expectations live in `src/evals/task-planner-cases.ts`, the runner in
`src/evals/task-planner-eval.ts`. It offers a never-executed tool library
(`src/evals/planner-tools.ts`: `web_search`, `fetch_page`, `read_file`,
`write_file`, `run_python`, `generate_image`) so the planner has something
concrete to route work to.

```bash
npm run dev:nodetool -- eval task-planner --list
npm run dev:nodetool -- eval task-planner -p anthropic -m claude-sonnet-5
IS_SANDBOX=1 npm run dev:nodetool -- eval task-planner -p claude_agent_sdk -m sonnet --no-find-model
```

Harness tests (scripted provider, no network):
`tests/task-planner-eval.test.ts`.

**Cost reads `$0` here under `claude_agent_sdk`.** The planner aborts the
provider loop from inside the accepting tool (`finish_plan`), and the SDK only
reports token usage on its terminal `result` message — which a cancelled query
never emits. The run is not free; the usage is simply unobservable. Score,
timing, and call counts are unaffected.

## Sub-agent execution eval suite (`subtask`)

Where the tool-loop suites score a model driving one flat tool surface, this
suite scores `RunSubtaskTool` — the primitive that decomposes work by spawning
a child agent that inherits the parent's toolset.

The harness drives a real `CodeActExecutor` equipped with `RunSubtaskTool` plus
six instrumented worker tools (`calculate`, `kv_write`, `kv_read`,
`lookup_fact`, `slugify`, `flaky_fail`). Each objective is written to force
delegation. Each tool records every call together with the
`SUBTASK_DEPTH_KEY` it read from its context — 0 for a parent-level call, >= 1
for one made inside a subtask. The same tool instances serve both levels, so
that field is the ground truth for who ran what, and the scorer can separate a
parent that delegated from one that did the job itself.

Scoring is structural (`checkSubtaskExpectations`): required parent and child
tools, forbidden tools, subtask-count and depth bounds, no failed subtasks,
required store keys, and answer substrings — never an exact transcript, so many
valid delegations pass. Metrics per case: expectation score, subtasks spawned,
deepest sub-agent level, tool calls at any depth, duration, cost. The aggregate
reports **success rate** (accepted over non-skipped), **mean score**, average
subtasks, and total cost; `--min-success` gates on the success rate.

The seven cases cover one tool per delegation (`delegate-compute`,
`delegate-read-write`, `delegate-lookup`, `delegate-transform`), fan-out
(`parallel-subtasks`), a child whose tool fails so the error must surface
rather than be swallowed (`error-propagation`), and one objective that
exercises every inherited tool (`all-tools`).

Cases and the instrumented tool library live in `src/evals/subtask-cases.ts`,
the runner in `src/evals/subtask-eval.ts`. The parent step and each subtask
share a turn cap of 16 unless `--max-iterations` says otherwise.

```bash
npm run dev:nodetool -- eval subtask --list
npm run dev:nodetool -- eval subtask -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval subtask -p openai -m gpt-5.4-mini --cases delegate-compute,all-tools
IS_SANDBOX=1 npm run dev:nodetool -- eval subtask \
  -p claude_agent_sdk -m sonnet --max-iterations 40 --no-find-model
```

The cases do not use `find_model`, so `--no-find-model` does not skip them.
The primary `-p` provider runs both the parent and every subtask. A low score
with `subtasks=0` is a finding about the model, not a harness bug: a capable
model often does trivial single-step work inline instead of delegating.

Harness tests (scripted provider, no network): `tests/subtask-eval.test.ts`.

## Tool-loop eval suites (frontend `ui_*` surfaces)

Where the graph-planner eval measures graph authoring, the tool-loop harness
measures the incremental, multi-turn tool-calling flow the browser UI exposes.
A real provider is handed the
frontend tool contract (names/descriptions/Zod schemas mirrored from
`web/src/lib/tools/builtin/*`) and drives it against a **headless bridge** —
a node-side fake that holds the same state shape and applies the same
mutations, with no browser. `runToolLoopEval` (`src/evals/tool-loop-eval.ts`)
is generic over the surface: a case supplies a `createBridge` factory
(`HeadlessSurfaceBridge<TFinal>` — `{ tools, finalState }`) plus structural
expectations, and the runner reports the same metrics as graph-planner
(accepted, score, tool calls, duration, cost). Scoring is structural
(`checkToolLoopExpectations`: required/forbidden tools, ordering, final-state
predicates, tool-call budgets, no-error-results) — never an exact transcript,
so many valid tool orderings pass.

**Checks carry a severity, and the score weighs them by it** (3/2/1 for
`critical`/`standard`/`advisory`, `scoreToolLoopChecks`). Whether the required
tools were called, what the final state looks like, and every escalation check
are `critical`; ordering and no-error-results are `standard`; the tool-call
budgets are `advisory`. A run that fails any critical check is additionally
capped at `CRITICAL_FAILURE_SCORE_CAP` (0.5).

The flat pass-fraction this replaced made scores non-comparable. A live sonnet
run of `confirm-before-delete` deleted the dead branch without ever asking —
the one behavior that case exists to measure — and scored **0.62**, because the
graph it produced satisfied every state predicate. The same run of
`escalate-missing-capability` escalated correctly, built the fallback the user
described, and scored **0.92**, docked only for exceeding a call budget. Under
weighting the first is capped at 0.5 and the second lands near 0.97, which is
the ordering the numbers should have had. `criticalFailures` per case makes it
visible without reading the check list, and the text report prefixes those
failures with `[critical]`.

Severity also decides the gated metric. A case is a **success** only when the
loop completed *and* no critical check failed, and `successRate` — what
`--min-success` reads — counts those. "The loop ran to a stop without a
provider error" is reported alongside as `completionRate`: it is a liveness
signal, not a result, and a model that called zero tools scores 100% on it.

Thirteen suites are registered:

| Suite | Tools | Bridge (`src/evals/`) |
|---|---|---|
| `tool-loop` | `ui_*` graph editor | `tool-loop-bridge.ts` |
| `workflow-escalation` | `ui_*` graph editor + `ask_user` | `tool-loop-bridge.ts` + `escalation.ts` |
| `script-tools` | `ui_script_*` | `surfaces/script.ts` |
| `jsscript-tools` | `ui_jsscript_*` | `surfaces/js-script.ts` |
| `sketch-tools` | `ui_sketch_*` | `surfaces/sketch.ts` |
| `timeline-tools` | `ui_timeline_*` | `surfaces/timeline.ts` |
| `storyboard-tools` | `ui_storyboard_*` | `surfaces/storyboard.ts` |
| `model3d-tools` | `ui_3d_*` | `surfaces/model3d.ts` |
| `svg-tools` | `ui_svg_*` SVG markup editor | `surfaces/svg.ts` |
| `audio-tools` | `ui_audio_*` audio sample editor | `surfaces/audio.ts` |
| `app-tools` | `ui_app_*` App Builder | `surfaces/app.ts` |
| `memory-tools` | `memory_*` / `asset_*` | `surfaces/memory.ts` |
| `creative-pipeline` | the three creative surfaces, composed, plus `ui_brief_*` / `ui_review_*` | `surfaces/creative-pipeline.ts` |

`creative-pipeline` is the long-horizon suite: one commission carried through
brief → ideation → sketch → storyboard → cut → review, scoring the *seams*
rather than any one surface. It composes the real sketch, storyboard and
timeline bridges instead of reimplementing them, so it cannot drift from the
three suites that already cover those contracts, and replaces
`ui_storyboard_assemble_timeline` with a version that actually drives the
timeline bridge — the handoff is the thing under test. `ui_brief_*` and
`ui_review_*` are eval instrumentation, not a frontend contract: a brief passed
only in the prompt can't be told apart from one the model ignored.

Rendered clips come back 1.35× the requested length, the way a video model that
emits fixed-length takes does, so a cut planned to exactly fill the brief
overruns. Catching that and trimming — the *last* clip, since shortening an
earlier one only opens a gap and leaves the runtime untouched — is what
separates a scoring run from a passing-looking one.

The predicates grade outcomes, not the shape of the process. Three checks were
rewritten after live runs, all the same mistake: they encoded one valid working
order and failed models that used another.

- Severity was a three-value enum that threw on `"critical"`, failing a run on
  this harness's vocabulary. Synonyms now map.
- Overrun detection grepped the note prose for runtime/duration/length, and
  scored a run that found the overrun and fixed it as a miss on wording. It
  now reads the severity the model assigned.
- `reviewActedOn` counted edits after the first review note, requiring
  report-before-fix. A sonnet run assembled at 16.20s, trimmed and
  ripple-moved to 12.00s, verified with `ui_review_get_cut` and *then* filed
  notes as a sign-off — a complete loop scored as "review changed nothing". It
  is now `cutRevisedAfterAssembly`, which accepts either order.

The SDK throws on its turn cap rather than stopping, so a low cap scores the
whole case zero — `full-pipeline` needs `--max-iterations 220` to clear. The
suite costs real money.

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval creative-pipeline \
  -p claude_agent_sdk -m sonnet --max-iterations 220 --no-find-model
```

`scripts/dump-creative-run.ts` runs one case and writes the work itself —
concepts, style-frame prompt, shot list, the assembled cut with timings, review
notes, phase snapshots and the full tool transcript — to
`nodetool-debug/creative-<case>.{md,json}`. The eval report gives pass/fail and
call counts, which is right for a scoreboard and useless for seeing what the
model made.

```bash
IS_SANDBOX=1 npx tsx packages/agents/scripts/dump-creative-run.ts \
  full-pipeline claude_agent_sdk sonnet 220
```

**Live media (`--live`).** The suite fakes every generate/render, which is what
makes it a CI-priced eval. Pass `--live` and the same tool calls additionally
hit fal, so the run leaves real stills and clips in
`nodetool-debug/creative-<case>-media/` without changing a tool contract or a
predicate. One run's output is checked in at `docs/evals/creative-pipeline/`
so the suite's media can be inspected without paying for a run. `MediaBackend` is an interface in the bridge; the fal wiring lives in
the script, because `packages/agents` has no fal dependency and should not grow
one for an opt-in path.

Stills default to `openai/gpt-image-2`, clips to
`ltx-2-19b/distilled/image-to-video`; override with `CREATIVE_IMAGE_MODEL` /
`CREATIVE_VIDEO_MODEL`. The first draft picked `flux/schnell` on cost grounds
and it was the wrong trade — flux mangles hands and the brief requires them in
three of four shots. Media is the cheap part of a live run; the agent loop
driving it dominates the bill.

Three caveats. The timeline still lays clips at the simulated overshoot, so the
scored runtime is not the runtime of the files on disk — the real overshoot has
run wider than the 1.35× modelled, so the planted defect is conservative; check
a runtime assertion against the takes on disk. The provider reads
`FAL_API_KEY`, not `FAL_KEY`. And no predicate can see the pixels:
`forbiddenAvoided` reads shot text and layer names, so a run passed it while
gpt-image-2 branded a bottle with lettering the brief forbade. The suite grades
the plan; grading the artifact needs a human or a vision model.

```bash
FAL_API_KEY=$FAL_KEY IS_SANDBOX=1 npx tsx \
  packages/agents/scripts/dump-creative-run.ts full-pipeline claude_agent_sdk sonnet 220 --live
```

### Permission-gated cases

A case that declares `permission: { mode, approve? }` runs its belt through
the production `CapabilityRun.invoke` ladder with a scripted approver
(`src/evals/tool-loop-permission.ts`), and every approval request is recorded
on `permissionRequests` for the case's `expect.permissionRequests` predicates,
which count as final-state checks. `plan-mode-blocks-mutation` and
`denied-mutation-stays-out` on the graph world assert that plan mode blocks a
write without asking and that a denied write leaves the graph untouched; both
are keyless. A gated case names its node types outright: `ui_search_nodes`
has no permission class of its own, so it classifies `external` and plan mode
blocks it.

### Interactive escalation (`workflow-escalation`)

Every other tool-loop case is fully specified: the prompt carries everything the
model needs, so guessing is never required and never penalized. This suite
removes that guarantee. Each case withholds something only the user can supply
— the names for an input and output, permission to delete a node, a choice
between two node types that fit equally well, a capability the catalog does not
have — and hands the model an `ask_user` tool wired to a **scripted user**
(`src/evals/escalation.ts`). The question is matched against the case's reply
script, the matching reply comes back as the tool result, and every exchange is
recorded.

That makes the score a pair, not a single judgement: `escalation.mustAsk` names
the reply the model has to trigger, and the case's `finalState` predicates check
that it then built what the answer said. A model that guesses fails on the ask;
one that asks the right question and ignores the reply fails on state. An
off-script question gets a deliberately useless fallback answer and trips
`allQuestionsMatched`, and `askBefore` is the confirm-before-you-act constraint
— `ui_delete_node` must not precede the first `ask_user`.

The fifth case, `no-escalation-needed`, guards the opposite failure: the
objective pins every value, `ask_user` is on the table, and reaching for it is
itself the failure. Without it the suite would reward a model that asks about
everything.

Escalation is a property of the generic runner, not of the graph surface — any
tool-loop case on any surface can declare `escalation` and get the same tool and
the same checks.

```bash
npm run dev:nodetool -- eval workflow-escalation --list
npm run dev:nodetool -- eval workflow-escalation -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval workflow-escalation -p openai -m gpt-5.4-mini --min-success 0.8
```

`confirm-before-delete` is the case models fail: they read the graph, delete
the dead branch, and never ask. `escalate-missing-capability` costs the most
calls, most of them `ui_search_nodes` hunting for an image node the catalog
does not have before accepting it isn't there. Run it with
`--max-iterations 40 --no-find-model`.

Harness tests, including a golden transcript per case so no case can be
unsatisfiable: `tests/escalation-tool-loop.test.ts`.

The `svg-tools` and `audio-tools` bridges build every tool from the shared
contracts in `@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts`,
the same record the browser tools read, and apply its exact-once replacement,
range and effect-parameter rules. The SVG bridge checks markup with
fast-xml-parser where the browser uses `DOMParser`. The audio bridge edits a
mono buffer at `AUDIO_BRIDGE_SAMPLE_RATE` and validates effects without
rendering them, because rendering needs an `OfflineAudioContext`. It records
each effect with its filled-in parameters, and `speed` changes the length as
the real render does.

`memory-tools` is the odd one out: instead of reimplementing a browser
surface, its bridge executes the **real backend tools** (`memory_save`,
`memory_list`, `memory_search`, `asset_search`) plus a stub `generate_image`
against an in-memory DB (`initTestDb`), so it exercises the actual persistence
+ resource validation a chat turn does. It scores the creative loop: generate
media → remember it with an asset reference → recall it — and one case seeds a
memory in a *different* thread, which only a cross-thread `memory_search`
finds.

Bridges reuse the pure packages where the real logic already lives —
`@nodetool-ai/timeline` (`splitClip`, `ANIMATION_PRESETS`, subtitle assembly,
clip/track factories) — rather than reimplement. The sketch surface reimplements
its layer-stack ops directly, but not its pixels: every raster layer is an
`@napi-rs/canvas` bitmap. `ui_sketch_stroke` runs the editor's paint core
(`@nodetool-ai/image-editor/painting.js`) and fill / gradient / shape / transform
/ adjust / crop / selection-shape run `@nodetool-ai/image-editor/raster.js`, both
pointed at skia with `setPaintSurfaceFactory(createCanvas)`, so a headless edit
is the edit the browser would paint. `ui_sketch_get_layer_image` composites those layers —
opacity and blend mode included, NodeTool's `"normal"`/`"add"` mapping onto
Canvas's `"source-over"`/`"lighter"` — and hands the model a PNG of its own
work. `SketchToolBridge.compositePng()` (or `getLastSketchToolBridge()`, for a
bridge the eval runner owns) takes the finished drawing out for a human to look
at. That is what makes `draw-an-animal` scoreable: it checks that strokes
landed on several named layers and covered a real fraction of the canvas
(`strokedFraction`, measured over stroked layers only so a solid `fillColor`
backdrop cannot pass it) — outcomes, not a pixel-exact cat.
Browser-only tools (asset capture, WebGL viewport render) are scoped out:
`ui_sketch_render_to_asset`,
`ui_timeline_get_clip_frames`, `ui_3d_capture_view`. Storyboard cannot import
`@nodetool-ai/llm-nodes` (it depends on `@nodetool-ai/agents`), so its
generate/render jobs are faked by flipping shot status. Its board holds wire
`Shot` objects and normalizes every write through
`normalizeStoryboardScreenplay` (`@nodetool-ai/protocol/api-schemas`), and
`finalState().savable` reports whether `storyboards.update` would accept what
the board now holds — a bridge that minted the `id`/`index`/`status` a model
omits kept this suite green through a bug that lost a user's board. The
app-builder surface
reimplements only the Puck *layout* ops (nested slot tree: top-level content plus
slot-valued props on Panel/Columns) headlessly — those live in `web/`
(`puckDataOps.ts`), which a backend package can't import. Its operation,
variable, resource, and binding-target tools call the shared doc-ops in
`@nodetool-ai/app-runtime` (`src/doc-ops.ts`), the same module the browser
handler calls, so that half of the contract cannot drift. The widget types it
offers come from `WIDGET_CATALOG` in the same package — every widget the editor
ships, with the fields each accepts — so `ui_app_list_component_types` reports
the same catalog headlessly that the browser reads off the live Puck config.

```bash
npm run dev:nodetool -- eval timeline-tools --list
npm run dev:nodetool -- eval script-tools -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval sketch-tools -p ollama -m qwen-3.5:4b --cases compose-layers
npm run dev:nodetool -- eval model3d-tools -p openai -m gpt-5.4-mini --min-success 0.8  # CI gate
```

Harness tests (scripted provider, no network): `tests/tool-loop-eval.test.ts`
plus one per surface (`tests/{script,js-script,sketch,timeline,storyboard,model3d,svg,audio,app,memory,creative-pipeline}-tool-loop.test.ts`).
For a live check against a real model, run the eval command above — a suite
whose verdict depends on what a model chose belongs behind an explicit
invocation, not in the unit suite, where a weak local model fails the run for
everyone.

**Running against the `claude_agent_sdk` provider.** Two gotchas, both from the
SDK's own agent loop (not the harness):

- **Turn cap throws.** The SDK raises `error_max_turns` when it reaches its turn
  limit, so a run that would merely *stop* under a stateless provider (Anthropic,
  Ollama) instead errors and the case scores `accepted=false`. Its turn
  accounting also counts each tool round, so the default `--max-iterations 12`
  is easily exhausted by an over-searching model. Pass a higher cap
  (`--max-iterations 40`) when driving these suites with `claude_agent_sdk`.
- **`uid=0` refusal.** The tool path runs the CLI under `bypassPermissions`, which
  it refuses as root; set `IS_SANDBOX=1` (or run non-root). It must be **exactly
  `1`** — the SDK's sandbox check is value-sensitive, so an ambient
  `IS_SANDBOX=yes` (as in Claude Code on the web) does **not** satisfy it and the
  child exits with code 1 and zero tool calls, which looks like an auth/spawn
  failure but isn't. Override it explicitly: `IS_SANDBOX=1 npm run …`. See
  [docs/AGENTS.md § Claude Agent provider](../../../docs/AGENTS.md#claude-agent-provider) for the full
  nested-session recipe.

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval timeline-tools \
  -p claude_agent_sdk -m sonnet --max-iterations 40 --no-find-model
```

## Mini-app build eval (`app-build`)

The only suite that scores a whole product loop rather than one stage:
`buildApp` (`src/app-build/`) takes a prompt through spec → plan → author →
check → run → judge, repairing what the oracle complains about, and the suite
counts how often that ends green and how much repair it took. Cases in
`src/evals/app-build-cases.ts`, runner in `src/evals/app-build-eval.ts`.

Metrics per `docs/mini-app-build-harness-design.md` §5.3: **one-shot rate**
(green with zero repair rounds — the PRD's north-star number), **green-within-
budget rate** (the suite's `successRate`, what `--min-success` gates on), repair
rounds, cost, and duration.

A case is green only when the build's own verdict is ok **and** its target-shape
checklist holds — operations, workflows, widget count, a widget nested in a
container, a `persist: true` variable, a streaming output shown by a display
widget, an operation reading a variable another wrote, and a widget carrying a
condition. Without the checklist a build that shipped one operation and three
widgets would score as a success. Each prompt case declares which
of the six medium-complexity traits (PRD §4) it exercises;
`uncoveredAppBuildTraits()` names any trait that lost its last case, and the
harness test fails on a non-empty answer.

The two deterministic cases (`greeting-card`, `draft-then-publish`) pin the
spec, bind template graphs (text transforms — no model in the app under test),
author from a scripted list of `ui_app_*` calls, skip the judge, and assert
exact widget values. They call no provider, so they run on every PR as the
Quality Gate's `app-build` leg; what they regress is the harness, not a model.
The full suite runs nightly (`.github/workflows/app-build-eval.yml`), reports,
and gates nothing — a model's off night is not a broken build.

```bash
npm run dev:nodetool -- eval app-build --list
npm run dev:nodetool -- eval app-build -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval app-build --cases greeting-card,draft-then-publish \
  -p ollama -m none --no-find-model --min-success 1   # no API key needed
```

Harness tests (scripted authoring, stub kernel runner, no network):
`tests/app-build-eval.test.ts`.
