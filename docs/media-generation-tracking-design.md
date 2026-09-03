# Media Generation Tracking — Technical Design

**Status:** Draft, for review
**Owner:** Matti Georgi
**Related:** `packages/execution/src/cost-ledger.ts`, `packages/runtime/src/cost-reconciler.ts`, [tool-class-retirement-design.md](tool-class-retirement-design.md), [HARNESS_FIRST.md](HARNESS_FIRST.md)

---

## 1. Summary

A media generation request is money out and minutes of wall clock, and today
the record of it is written *after* it succeeds, by a listener that never sees
a failure, a cancellation, or a process restart. The row it writes names no
asset, the asset names no row, and the reconciliation that turns an estimate
into the billed amount is a detached promise that dies with the process.

One primitive fixes this: a **generation** is a row opened *before* the
provider is called and closed with a terminal status, a cost, and the assets it
produced. A **follower** owns that row from submit to close. It is not a new
runtime: it is the ledger listener, rewritten to track a lifecycle instead of
recording a success, plus a durable reconcile queue and a startup sweep. The
follower runs in the process that made the call and outlives the caller
(a cancelled chat turn, a finished tool call), so the outcome is recorded even
when nobody is waiting for it.

Agents get the record as a capability module, `generations`: list, get,
await, cancel, reconcile. Generation capabilities gain `background: true`,
which returns the generation id at once and leaves the follower to finish the
job. The CLI gets the same surface as `nodetool generations`.

## 2. What is wrong today

Read with `packages/execution/src/cost-ledger.ts` and
`packages/runtime/src/context.ts` open.

- **F1. Only success is recorded.** `recordFromMessage` writes a row on
  `prediction` + `status: "completed"`. A `failed` prediction, a cancelled one,
  or one interrupted by a restart writes nothing. kie bills a task at submit
  and Meshy bills a preview pass before refine, so a failure is not free.
- **F2. Cost and asset are not linked.** A `nodetool_predictions` row has no
  asset id and an `nodetool_assets` row has no prediction id. "What did this
  clip cost" and "which asset came out of this charge" are both unanswerable.
- **F3. The message id is not the row id.** `runProviderPrediction` mints a
  `randomUUID()` for the `prediction` message; `Prediction.create` mints
  another for the row. A client that watched the message cannot find the row.
- **F4. Reconciliation is fire-and-forget.** `recordNodeProviderCost` calls
  `void reconcileProviderCost(...)`. No retry, no record of whether it ran, and
  it dies with the process. kie never reconciles at all:
  `reportKieProviderCost` (`packages/kie-nodes/src/kie-base.ts`) omits
  `provider_request_id` though the task id is in hand.
- **F5. Five caller surfaces, three bypass the seam.** Workflow nodes and agent
  capabilities go through `runProviderPrediction`. The chat turn's direct
  generation (`packages/websocket/src/session/chat-turn.ts`), the
  `generate_media` RPC (`session/inference.ts`) and `nodetool generate`
  (`packages/cli/src/commands/generate.ts`) call `provider.textToImage(...)`
  and friends directly, each with its own asset save and its own
  `Prediction.create`. BYOK direct generation writes no row by design.
- **F6. 3D generation is off the books.** `TextTo3DNode` and `ImageTo3DNode`
  (`packages/video-nodes/src/nodes/model3d/generation.ts`) call
  `provider.textTo3D` directly. `text_to_3d` and `image_to_3d` are absent from
  `ProviderCapability` and from `UNIT_BILLED_CAPABILITIES`. Meshy and Rodin
  spend reads as free.
- **F7. A `completed` prediction message carries the raw output bytes as
  `data`.** Every listener, the chat socket forwarder included, receives a
  full video buffer. Nothing in `web/src` reads `data`; the chat and workflow
  reducers read `status`, `node_id` and `logs`.
- **F8. An agent cannot see a generation.** `get_cost_summary` aggregates; no
  capability lists what is running, what a call cost, or where its asset is.

## 3. Design goals

1. **One row per generation, opened before spend.** The row exists from the
   moment the provider is asked, whatever happens after.
2. **Every terminal state is a row state.** completed, failed, cancelled,
   interrupted. Silence is never "free".
3. **The asset is the outcome.** A completed generation names its assets, and
   each asset carries its generation id.
4. **One seam.** Every surface that asks a provider for media goes through
   `ProcessingContext`. An audit fails the build on a new bypass.
5. **Reconciliation is durable.** A charge that can be reconciled is
   reconciled, retried with backoff, and the row says whether it was.
6. **The follower is the capability.** Rule 4 of HARNESS_FIRST: the CLI and
   agent-tool forms are the feature, the dashboard renders them.

## 4. Architecture

```
caller (capability · node · chat turn · RPC · CLI)
  │  context.runGeneration(req)                ← the one seam (§5)
  ▼
ProcessingContext (packages/runtime/src/context.ts)
  id = randomUUID()
  emit prediction{status:"running", id, origin, params}
  dispatchCapability(provider, req)  inside a receipt scope (AsyncLocalStorage)
    provider code: recordGenerationReceipt({provider_request_id, cost?})
  persist output → createAsset(…, metadata.generation_id = id)
  emit prediction{status:"completed", id, asset_ids, receipt, duration}
       or        {status:"failed",    id, error, receipt}
       or        {status:"cancelled", id, receipt}
  return {id, output, assets}
  │  addMessageListener
  ▼
GenerationTracker (packages/execution/src/generation-tracker.ts)   ← the follower
  running   → Prediction.create({id, status:"running", …origin})
  completed → price (receipt cost wins, else catalog) · update row · enqueue reconcile
  failed    → update row · enqueue reconcile when a request id exists
  cancelled → update row · enqueue reconcile when a request id exists
  ReconcileQueue: rows with provider_request_id, reconciled_at null, attempts < 5
  StartupSweep:   rows still "running" from a dead process → "interrupted"
  │
  ▼
nodetool_predictions (packages/models)      ← one table, lifecycle in place
  ▲                          ▲
  │ generations capabilities │ nodetool generations · nodetool costs · Costs dashboard
```

The dependency arrows are unchanged: `runtime` knows nothing about `models`,
`execution` imports both, hosts attach the tracker where they attach the
ledger today (`packages/execution/src/session.ts`,
`service/workflow-run.ts`, `packages/websocket/src/session/chat-turn.ts`).

### D1. Reuse `nodetool_predictions`; do not add a generations table

The table already carries `status` (default `pending`), `error`,
`provider_request_id`, `parameters`, `metadata`, `started_at`,
`completed_at`, `duration`, and the unit-billing columns. `nodetool costs`,
`get_cost_summary` and the Costs dashboard read it. A second table would
split "what ran" from "what it cost" and every consumer would join them. The
lifecycle goes into the row that already exists; the write path changes from
insert-on-success to insert-on-start plus update-on-close.

### D2. The follower is a listener plus a durable queue, not a worker process

The provider call is already an in-process `await` inside the SDK or the
provider's own poll loop (`kie-provider.ts pollUntilDone`,
`gemini-provider.ts` operation polling, `meshy-provider.ts pollTaskStatus`).
The follower does not take that over. It watches the messages the seam emits,
which is what the ledger does today, and adds the two things a listener
cannot give: a queue that survives a restart (reconciliation, stored in the
row) and a sweep that closes rows the restart orphaned. Resumable polling of a
provider job across restarts needs a submit/poll split in every provider and is
out of scope (§12).

### D3. Receipts flow through AsyncLocalStorage, not through return types

Twenty-five provider methods return bytes. Threading a request id through
each signature is a large diff for one field. `packages/runtime/src/invocation-account.ts`
already scopes `{costUsd, createdAssets}` per invocation with
AsyncLocalStorage; the receipt scope is the same shape. A provider calls
`recordGenerationReceipt({provider_request_id, cost?})` from inside the method
and the seam reads it after dispatch. FAL (`client.subscribe` returns
`requestId`) and kie (`taskId`, `creditsConsumed`) fill it in first.

### D4. The seam persists the asset

Today `persistOutput` in `packages/agents/src/tools/asset-persist.ts` saves the
asset after the seam returns, so the seam cannot name it. `runGeneration` takes
a `persist` option and saves through `createAsset` before it emits
`completed`, stamping `metadata.generation_id`, `workflow_id`, `node_id` and
`job_id` on the asset. The caller gets `assets` back and stops saving on its
own. A host with no `createAsset` interface (a hermetic eval, the CLI without a
database) gets the bytes and writes a workspace file as before; the row then
records `asset_ids: []` and `metadata.persisted: "workspace"`.

## 5. The seam

In `packages/runtime/src/context.ts`.

```ts
export type GenerationSurface =
  | "workflow" | "capability" | "chat" | "rpc" | "cli";

/** Who asked. Every field the row and the asset carry back to the caller. */
export interface GenerationOrigin {
  surface: GenerationSurface;
  thread_id?: string | null;
  tool_call_id?: string | null;
  job_id?: string | null;
  node_id?: string | null;
}

export interface GenerationRequest extends ProviderPredictionRequest {
  origin?: Partial<GenerationOrigin>;   // defaults from the context (§5.1)
  persist?: {
    name?: string;          // asset name; default `<capability>-<ts>.<ext>`
    mime?: string;          // default sniffed from bytes, then by capability
    parentId?: string;      // asset folder
  };
  signal?: AbortSignal;     // cancel_generation reaches the provider through it
}

export interface GenerationResult<T = ProviderPredictionResult> {
  id: string;                       // the row id and the message id (F3)
  output: T;
  assets: AssetRef[];               // empty when nothing was persisted
  receipt: GenerationReceipt | null;
  duration_ms: number;
}

export interface GenerationReceipt {
  provider_request_id?: string | null;
  /** The provider's own charge, when it states one. Wins over the catalog. */
  cost?: Pick<ProviderCost, "amount" | "currency" | "billing_unit" | "quantity" | "unit_price"> | null;
}

runGeneration(req: GenerationRequest): Promise<GenerationResult>;
```

`runProviderPrediction(req)` stays and becomes
`(await this.runGeneration(req)).output`, so the node call sites keep
compiling. `textToSpeechEncoded`, `textToMusic` and `streamProviderPrediction`
get the same lifecycle (they already emit `running`/`completed`/`failed`; they
gain the origin, the receipt and the cancelled state).

### 5.1 Origin defaults

The context knows `userId`, `jobId`, `workflowId` and `threadId`. A request
that names no origin gets `surface: "workflow"` with the context's job and
workflow ids inside a run, and `surface: "chat"` with its thread id inside a
chat turn. A capability passes `surface: "capability"` and its `tool_call_id`
explicitly, because that is the one id the context does not hold.

### 5.2 Message changes

`predictionSchema` in `packages/protocol/src/messages.ts`:

- `status` narrows to `"running" | "completed" | "failed" | "cancelled"` on
  the wire; `"interrupted"` exists only in the row, written by the sweep.
- add `origin: GenerationOrigin`, `asset_ids: string[]`,
  `receipt: GenerationReceipt | null`.
- `data` stops carrying bytes (F7). It stays in the schema, nullable, for the
  segmentation result (`ImageSegmentationMask[]` metadata without pixels) and
  the ASR transcript, which are results and not media.

`params` is redacted before it is emitted or stored: byte fields, `data:` URLs
and base64 blobs are replaced with `{bytes: n}`. The redaction is the one the
supervisor uses for `Escalation.inputs`.

### 5.3 Capabilities added to the seam

`text_to_3d` and `image_to_3d` join `ProviderCapability`,
`dispatchCapability` and `UNIT_BILLED_CAPABILITIES` (F6). The two 3D nodes call
`runGeneration` instead of `context.getProvider(...).textTo3D(...)`.

### 5.4 Cancellation

`runGeneration` registers `{id, abort}` in a process-level
`GenerationRegistry` for the life of the call. The registry is the shape of
`packages/agents/src/background-subtasks.ts` (a record map, a version counter,
a waiter list), lifted to the process because a generation outlives the turn
that started it. `cancel_generation` aborts it;
the seam emits `cancelled` with whatever receipt the provider recorded before
the abort. Providers that already take `signal` (image and video params)
stop polling; the rest finish their current HTTP call and the result is
discarded. Cancelling does not refund: a provider that bills at submit still
bills, which is why a cancelled row keeps its request id and is reconciled.

## 6. The follower

`packages/execution/src/generation-tracker.ts`, replacing the `prediction`
branch of `recordFromMessage`. The `node_update` + `provider_cost` branch stays
for the node packages that call a provider SDK directly (§8, S7).

### 6.1 Row lifecycle

| Message | Row write |
|---|---|
| `running` | `Prediction.create({id, user_id, status: "running", provider, model, capability, surface, thread_id, tool_call_id, job_id, node_id, workflow_id, project_id, document_id, parameters, started_at})` |
| `completed` | `update({status: "completed", cost, billing_unit, quantity, unit_price, currency, provider_request_id, asset_ids, duration, completed_at, metadata.price_source})`, then enqueue reconcile when `provider_request_id` is set |
| `failed` | `update({status: "failed", error, provider_request_id, completed_at})`; enqueue reconcile when a request id exists, because a failed call may be billed |
| `cancelled` | as `failed`, with `status: "cancelled"` |

Pricing order on `completed`: the receipt's cost when the provider stated one
(`metadata.price_source: "provider"`), else the catalog through
`priceGeneration` (`"model-catalog"`), else `cost: null` with
`unpriced_reason`, as today. A null stays null: an unpriced row is countable,
a zero is a lie.

A create that fails (no database on this host) is logged at `warn` and the
tracker remembers the id, so the later update for that id is skipped instead
of logged again. Bookkeeping stays best-effort for a hermetic run, and loud.

### 6.2 Reconcile queue

State lives in the row: `reconciled_at`, `reconcile_attempts`,
`metadata.reconcile_error`. The queue is a query, not memory:

```sql
provider_request_id IS NOT NULL AND reconciled_at IS NULL
AND reconcile_attempts < 5 AND status IN ('completed','failed','cancelled')
```

A worker drains it on a timer (every 5 minutes; the first attempt for a fresh
row after 60 s, because billing events lag the request) with attempts spaced
1, 5, 30, 120, 720 minutes. A provider with no reconciler marks the row
`reconciled_at = now, metadata.reconcile: "unavailable"` on the first pass so
it leaves the queue. The FAL reconciler stays as it is
(`packages/fal-nodes/src/fal-billing.ts`); kie gains one over
`/api/v1/jobs/recordInfo`, whose status payload already carries
`creditsConsumed`. The worker is attached once per process by the server
(`packages/websocket`) and by the CLI when it opens a database; an eval attaches
none.

### 6.3 Startup sweep

On attach, rows with `status = "running"` and `started_at` older than the
process start are set to `interrupted` with
`metadata.interrupted_reason: "process restart"`, and enqueued for reconcile
when they carry a request id. A row a live process is still driving is never
older than its own start, so the sweep cannot close a real run.

### 6.4 Run totals

`packages/websocket/src/session/job-execution.ts` accumulates a run's cost
for the job row from the same messages (`_handlePredictionCost`,
`_handleNodeProviderCost`, `runMeasuredCost`), re-pricing each prediction
itself. It keeps doing that, from the new `receipt` field first and the
catalog second, so the job total and the row agree by construction. It does
not write rows; that stays the tracker's.

### 6.5 Double counting

One generation, one row. Two guards:

- A node that goes through the seam *and* calls `setProviderCost` (the FAL and
  kie factories, once they move to the seam in S7) would write a row from the
  `prediction` message and a second one from `node_update.provider_cost`. The
  tracker records the invocation's generation ids; a `node_update` whose
  invocation already produced a row with a receipt cost writes nothing, and a
  `node_update` whose row exists without a receipt updates that row instead
  of inserting. The kernel already scopes an invocation
  (`invocation-account.ts`), so the mapping is by invocation, not by guess.
- `runDirectMediaGeneration` (`inference.ts`) writes its own
  `Prediction.create` after `reserveSpend`. That write goes; the seam's row is
  the row, and the nodetool-provider budget path keeps `admitSpend`/
  `reserveSpend`/`releaseSpend` around the `runGeneration` call.

## 7. Schema

`packages/models/src/schema/predictions.ts` and `schema-pg/predictions.ts`,
one migration in `migrations/versions.ts`:

| Column | Type | Why |
|---|---|---|
| `capability` | text | the `ProviderCapability`; today only in `metadata` |
| `surface` | text | `GenerationSurface` |
| `thread_id` | text, index `(user_id, thread_id)` | the chat turn that asked |
| `tool_call_id` | text | the capability call that asked |
| `job_id` | text, index | the run that asked |
| `asset_ids` | json text | the outcome (F2) |
| `reconciled_at` | text | queue state (§6.2) |
| `reconcile_attempts` | integer, default 0 | queue state |

plus index `(user_id, status)` for `list_generations`. Existing rows keep
`status: "completed"` and nulls elsewhere; nothing is backfilled.

Assets: no column. `metadata.generation_id` on the asset row, written by the
seam, is enough for `get_generation` and for an asset panel to show "cost
$0.41, 6 s of Veo" on the clip. `nodetool_assets` already carries
`workflow_id`, `node_id` and `job_id`.

Aggregates (`Prediction.aggregateDashboard`, `aggregateByUser`,
`aggregateByProvider`, `aggregateByModel`, `listSpendByProject`) add
`status != 'running'` so an open row is neither summed nor counted as
unpriced, and gain `running_count` and `interrupted_count` in
`AggregateResult`. The filter excludes rather than allows because the token
writers (`chat-turn.ts _logProviderCall`, `cli/src/supervisor.ts`,
`app-build/build.ts`) all write `completed` today and none of them is touched
here. Spend sums include a failed row that carries a cost, because that is
money out.

## 8. Surfaces that must go through the seam

Enumerated, not sampled. Each one either moves in this design or is named as
staying out with the reason.

| | Surface | Today | Change |
|---|---|---|---|
| S1 | Agent capabilities: `generate_image`, `edit_image`, `segment_image`, `generate_video`, `animate_image`, `generate_speech`, `generate_music` (`packages/agents/src/capabilities/media.ts`) | `runProviderPrediction` then `persistOutput` | `runGeneration` with `persist` and `origin: {surface: "capability", tool_call_id}`; drop the capability-side save; return `generation_id` next to `asset_id` |
| S2 | `render_storyboard_stills`, `render_storyboard_clips`, `revise_storyboard_clip` (`capabilities/storyboards.ts`), `voice_script_lines` (`capabilities/scripts.ts`, which calls `generateSpeech.impl`) | same as S1 | same as S1; the shot and the take record the generation id next to the asset id |
| S3 | Workflow nodes through `runProviderPrediction` (`image-nodes`, `video-nodes`, `audio-nodes`, `video-nodes/script.ts`, `llm-nodes/shots.ts`) | seam, no persist, `autoSaveAsset` on the websocket host (`packages/websocket/src/session/asset-autosave.ts`, driven per `generation_complete`, deduped on `metadata.generation_index`) | unchanged call; origin defaults to the run. The node returns an inline ref, so the seam cannot name the asset. Linking goes the other way: the tracker keeps, per `(job_id, node_id)`, the generation ids it opened and has not linked; autosave asks for them when it saves that node's `generation_complete`, stamps `metadata.generation_ids` on the asset, and the tracker writes `asset_ids` on those rows. A node that made several generations in one invocation links all of them to the asset rather than guessing which one |
| S4 | 3D nodes (`video-nodes/src/nodes/model3d/generation.ts`) | direct `provider.textTo3D` (F6) | `runGeneration` with the two new capabilities |
| S5 | Chat turn direct generation (`chat-turn.ts handleMediaGenerationMessage`) and `generate_media` RPC (`inference.ts runDirectMediaGeneration`) | direct provider methods, own asset save, own `Prediction.create` (RPC) | `ctx.runGeneration` with `persist` and `origin: {surface: "chat" \| "rpc", thread_id}`; delete both local `storeAsset` helpers and the RPC's row write; BYOK gets a row, unpriced when the catalog has no price |
| S6 | `nodetool generate` (`packages/cli/src/commands/generate.ts`) | direct provider methods, `node:fs` write, hand-rolled `recordGenerationSpend` | build a `ProcessingContext` (the CLI already does for `node run`), `runGeneration` with `origin: {surface: "cli"}`; `-o` still writes the file; the row and the asset come from the seam when a database is open |
| S7 | Provider node packages that drive an SDK themselves: `fal-nodes`, `kie-nodes`, `atlascloud-nodes`, `together-nodes`, `topaz-nodes`, `minimax-nodes`, `replicate-nodes`, `reve-nodes`, `huggingface-nodes`, `elevenlabs-nodes`, `integration-nodes/kie-dynamic.ts` | `setProviderCost` on FAL and kie only, `autoSaveAsset` for the media, no row for the rest | **Stays on the `node_update` path in this design.** Two fixes ship with it: kie passes `taskId` as `provider_request_id` (F4) and `fal-dynamic.ts` calls `reportFalCost` like `fal-factory.ts` does. Moving these packages behind the seam means giving `dispatchCapability` an endpoint-shaped request, which is its own design. The audit (§9) lists them as an allowed set so the debt is visible, not forgotten |

## 9. Audit

`packages/execution/tests/generation-seam-audit.test.ts`, modelled on
`packages/runtime/tests/url-egress-audit.test.ts`. It scans `packages/*/src`
for a call to any media method of `BaseProvider` (`textToImage`,
`imageToVideo`, `textTo3D`, ... the list is read from `base-provider.ts` so a
new method is covered the day it lands) outside `packages/runtime/src/` and
outside the S7 allow-list, and fails on the first unclassified call. It also
asserts it found the S7 calls, so it cannot pass by matching nothing. It is
inverted once in the PR that adds it: a bare `provider.textToImage(` in a
scratch file under `packages/agents/src/` must turn it red.

## 10. Capabilities

New module `packages/agents/src/capabilities/generations.ts` +
`generations.specs.ts`. Wiring follows the checklist every module pays:
the spec import, the loader in `MODULES`, the name in
`DECLARED_CAPABILITY_MODULES` and the entry in `MODULE_SPECS` of
`capabilities/registry.ts`; the category snapshot in
`packages/agents/tests/capabilities-registry.test.ts`; the `generations`
namespace in the CodeAct API map (`codeact/nodetool-api.ts`), so guest code
gets `nodetool.generations.wait(id)` next to `nodetool.jobs.wait(id)`; the
tRPC classification in `packages/websocket/src/trpc/sandbox-coverage.ts`
for any procedure the dashboard gains to list generations (classified
`capability`, since the module covers it); the module table in
`docs/AGENTS.md`; and a `capability-table.ts` entry per capability naming
`packages/agents/tests/capabilities-generations.test.ts` and
`packages/execution/tests/generation-tracker.test.ts`.

| Name | Category | Input | Returns |
|---|---|---|---|
| `list_generations` | read | `status?`, `provider?`, `capability?`, `thread_id?`, `job_id?`, `since?` (ISO), `limit` (default 50, max 500) | `{generations: GenerationSummary[], next}`: id, status, provider, model, capability, cost, currency, asset_ids, started_at, duration, error |
| `get_generation` | read | `generation_id` | the full row: parameters (redacted), price breakdown, receipt, reconcile state, assets as `asset://` refs, origin |
| `await_generation` | read | `generation_id`, `timeout_seconds` (default 300, max 1800) | the row once terminal, or `{status: "running", waited_seconds}` on timeout. In-process it subscribes to the registry; across processes it polls the row every 5 s |
| `cancel_generation` | write | `generation_id` | `{generation_id, status: "cancelled"}` or `{cancelled: false, error}` when the id is not running or not the caller's. The category matches `cancel_job`, and so does the row write: one UPDATE with `id`, `user_id` and `status = 'running'` in the WHERE (`Job.markCancelledIfActive`), then the abort |
| `reconcile_generation` | external | `generation_id` | `{before: cost, after: cost, reconciled: boolean, reason?}`; runs the provider's reconciler now, outside the queue's schedule |

Every read is scoped: `Prediction.find` is unscoped today and stays that way
for the ledger; the module uses a new `Prediction.findForUser(userId, id)` and
`Prediction.listGenerations(userId, filter)`, both with `user_id` in the
`WHERE`.

### 10.1 `background: true` on the generation capabilities

`generate_image`, `edit_image`, `generate_video`, `animate_image`,
`generate_speech`, `generate_music`, `render_storyboard_stills` and
`render_storyboard_clips` accept `background: true`. The capability calls
`runGeneration` without awaiting the result, reserves the estimated cost
against the run's `RunBudget` (the same reservation a synchronous call makes),
and returns `{generation_id, status: "running", estimated_cost}` in the same
turn. The follower closes the row; `await_generation` collects it. A
background generation an agent never awaits is still finished, recorded, and
its asset saved, which is the whole point.

Bounds: at most 16 background generations open per run (the number the native
flow allows for streams), and none once the budget is exhausted. A run that
ends with background generations open leaves them running: they are the
follower's, not the turn's.

### 10.2 What is returned to the model

Every generation capability adds `generation_id` to its result next to
`asset_id`, so a model that wants the cost of the image it just made calls
`get_generation` with an id it already holds. `persistOutput`'s `SavedOutput`
shape is unchanged apart from that field.

## 11. Harness

- **CLI**: `nodetool generations list [--status] [--provider] [--since] [--json]`,
  `get <id>`, `await <id> [--timeout]`, `cancel <id>`, `reconcile <id>`, plus
  `nodetool generations sweep` (run the startup sweep and one queue drain by
  hand). `nodetool costs list` gains `status` and `assets` columns. Each
  subcommand takes `--json`; exit code is the verdict.
- **Selfcheck**: `packages/execution/tests/generation-tracker.test.ts` with
  the fake provider: running→completed writes one row with the asset id and
  the message id; failed writes a failed row; an aborted call writes cancelled;
  a row older than process start is swept to interrupted; a receipt cost wins
  over the catalog; a reconciler that throws increments attempts and leaves
  the row queued; five failures leave the queue. `packages/agents/tests/capabilities-generations.test.ts`
  drives the five capabilities and `background: true` through the headless
  run, and asserts a foreign user's row is invisible.
- **Registry**: surface `generation-tracking` in
  `packages/cli/src/harness/registry.ts` with paths
  `packages/execution/src/generation-tracker.ts`,
  `packages/agents/src/capabilities/generations*.ts`,
  `packages/runtime/src/generation-receipt.ts`, covered by
  `capability-suites`; the audit test is named as its selfcheck.
- **Eval**: one `creative-pipeline` case where the objective is "render these
  four shots and tell me what each cost", scored on `render_storyboard_stills`
  followed by `get_generation` or `list_generations`.

## 12. Out of scope

- **Resumable provider polling.** After a restart, a kie task or a Veo
  operation is still running at the provider. Picking it up again needs a
  `submit`/`poll` split per provider (`kie`, `gemini`, `openai`, `meshy`,
  `rodin`, `minimax`, `together`, `xai`, `atlascloud`, `evolink`, `topaz`; FAL
  and Replicate hide it inside their SDKs). The row records the request id so
  the cost is recovered; the media is not. This is the next design once the
  row exists.
- **Moving S7 behind the seam** (§8).
- **Budget refusal before the call.** `admitSpend` exists for the nodetool
  provider only; extending the pre-run gate to BYOK is a pricing question, not
  a bookkeeping one.
- **UI.** The Costs dashboard and an asset panel badge render the row; neither
  is designed here.

## 13. Rollout

| Phase | Ships | Gate |
|---|---|---|
| P1 | Schema, `runGeneration` + receipts + `persist`, tracker with queue and sweep, S1/S2 capabilities on the seam, `generations` module, CLI, audit (with S4/S5/S6 in the allow-list, marked `TODO(P2)`) | tracker and capability suites; audit inverted; `capabilities:check`; `harness gate` |
| P2 | S4, S5, S6 on the seam; S7 fixes (kie request id, fal-dynamic cost); allow-list shrinks to S7 | audit shrinks and stays green; `generate_media` route tests; CLI `generate` writes a row through the seam |
| P3 | `background: true`, `await_generation`, `cancel_generation` wired to the registry; aggregate changes and dashboard columns | capability suite for background; `costs` route tests |

P1 is the bookkeeping the title asks for. P2 closes the bypasses. P3 is the
ergonomics.

## 14. Risks

- **R1. A row for every call doubles the write rate on the predictions
  table.** Two writes per generation instead of one, on a table indexed five
  ways. A generation is seconds to minutes of provider time; two SQLite
  writes are not the bottleneck. Watched, not mitigated.
- **R2. The sweep marks a slow generation interrupted after a restart while
  the provider finishes it.** Correct: the process that would have collected
  the bytes is gone. The row says so, keeps the request id, and reconciles the
  cost. The media is lost until §12's resumable polling.
- **R3. A provider reports a request id but no reconciler exists.** The row
  leaves the queue on the first pass as `unavailable`; the estimate stands. No
  retry storm.
- **R4. Receipt scope leaks across concurrent generations.** AsyncLocalStorage
  isolates per async context; a provider that schedules work outside the
  awaited chain (a detached timer) would record into nothing. The receipt call
  logs at `debug` when it finds no scope, and the tracker test runs two
  generations concurrently and asserts each row gets its own id.
- **R5. Dropping bytes from `prediction.data` breaks a consumer.** Enumerated:
  `web/src/stores/workflowUpdates.ts`, `web/src/core/chat/chatProtocol.ts`,
  `web/src/hooks/timeline/useGenerateClip.ts`,
  `web/src/hooks/sketch/useGenerateLayer.ts`,
  `packages/websocket/src/chat-prediction-forwarder.ts`. None reads `data`.
  Mobile is checked in the PR the same way.
- **R6. `background: true` spends money a turn never reports.** The
  reservation against `RunBudget` happens at submit, so the cap holds; the
  turn's cost summary counts reserved spend as spent and says
  `n generations still running`.
