# RFC: Generation Events — `generation_complete`, re-scoped `output_update`, autosave cutover

**Status:** Draft for sign-off · **Owner:** runtime/web · **Repo:** `/Users/mg/workspace/nodetool`

> Every line/file reference below was re-verified against the working tree before this revision. Findings that were wrong-as-written (the double-save rationale, the actor `job_id` field, "`_messages` authoritative for autosave") are corrected in-body and catalogued in the **Addressed review notes** appendix. The scope was widened from "kernel→websocket→web-editor" to **all message consumers** (browser runner, mobile, CLI, mini-apps, timeline/sketch editors, chat) after a consumer census.

---

## 1. Summary

We split the one overloaded "a node produced something" signal into **three orthogonal channels**:

1. **`node_update`** — node **lifecycle** only (running / completed / error, timing, cost). One per node-run. Stops being the autosave/generation source.
2. **`generation_complete`** (NEW) — a generator committed **one complete artifact**: `{ node_id, node_name, node_type, index, outputs }` (plus `job_id`/`workflow_id` stamped downstream). Emitted once per `process()` result (once at stream-end for `genProcess`). Authoritative; drives `liveGenerations` + autosave; **never suppressed**.
3. **`output_update`** — demoted to **ephemeral display-only** live feed (text tokens, progressive preview, realtime audio). Carries an explicit `disposition: "append" | "replace"`. Never persisted, never creates a generation. Edge-suppression becomes harmless.

The kernel change is small and TS-only. The **breadth** is in the consumers: every surface that today reads `node_update.result` or `output_update.value` as an artifact must move to `generation_complete.outputs` or accept a documented, graceful degradation to one artifact.

---

## 2. Problem & evidence

**The kernel collapses multi-execution runs into one `node_update`.** `_emitNodeStatus("completed", …)` fires exactly once per node-run at `actor.ts:440-443`, carrying `this._latestResult ?? {}`. There are only 4 `_emitNodeStatus` call sites (`actor.ts:278` running, `:421` suspended, `:426` error, `:440` completed). `_latestResult` (declared `actor.ts:157`) is **overwritten** on every execution — never accumulated:

| `actor.ts` line | mode | write | object identity |
|---|---|---|---|
| 357 | streaming-input `run()` | `= nodeOutputs.collected()` | fresh from collector |
| 369 | streaming-input legacy `process()` | `= outputs` | **same ref** as executor return |
| 987 | `genProcess` per-yield | `= {...collected}` | **fresh spread** each yield |
| 994 | `genProcess` stream-end | `= {...collected}` | **fresh spread** |
| 1000 | correlated `process()` | `= outputs` | **same ref** as executor return |
| 1290 | controlled-loop `process()` | `= outputs` | **same ref** as executor return |

(The object-identity column is load-bearing for §7 — see the corrected double-save analysis.)

So a `ListGenerator.item → TextToImage.prompt` run that fires `TextToImage` 6× (the correlated `while (isReady(key))` drain at `actor.ts:716-720`, each call overwriting `_latestResult` at `:1000`) emits **one** `node_update{completed}` carrying run #6 only.

**Autosave inherits the collapse.** `autoSaveAssets` (`unified-websocket-runner.ts:428-571`) is called from the single site at `unified-websocket-runner.ts:1932-1953`, gated on `outbound.type === "node_update" && status === "completed" && result != null && meta?.auto_save_asset`. It walks `outbound.result` (= `_latestResult`, run #6) → persists **1 asset/run, 5 lost**. (Idempotency guard at `:468` `if (assetValue.asset_id) continue` skips already-`asset_id`'d values by mutating that same object in place at `:518-520`; `node_id`/`job_id` stamped from `opts` at `:506-507`. Crucially, `Asset` records carry `node_id`+`job_id` but **no `index`** — there is no persisted-side dedupe key beyond the in-place `asset_id` mutation. This matters for replay; see §15.)

**`output_update` is the accidental sole carrier of the lost variants — and it's overloaded three ways.** Emitted at `runner.ts:1286-1294`, once per emit (per yield / per key / per control-run — NOT collapsed). But suppressed at `runner.ts:1280-1284` for any handle with an outgoing **data** edge (`findEdges(sourceNodeId, handle).some(isDataEdge)` unless `always_emit_output_updates`). So an intermediate generator feeding a Preview emits nothing; only the terminal Preview re-emits and buffers all N. `output_update` simultaneously serves: (1) live incremental display (text tokens, progressive preview → `setOutputResult(append=true)`), (2) realtime audio transport (~50/s, coalesced to a worklet bus — the *reason* suppression exists, `runner.ts:1257-1264`), and (3) the accidental multi-execution variant carrier. It also can't distinguish a chunk (append) from a whole value (replace) — `workflowUpdates.ts:515` hardcodes `append=true` (latent progressive-preview bug).

**Net:** a 6-image run produces 6 artifacts; the generation timeline and persistence see 1.

---

## 3. Goals / Non-goals

**Goals**
- Every committed artifact of a multi-execution run is persisted (N assets/run) and appears as a navigable variant — **on both the server and in-browser execution paths**.
- Lifecycle, artifacts, and live display travel on three independent channels with clear contracts.
- `output_update` becomes correctness-irrelevant: edge-suppression can drop it freely.
- Zero `nodetool-core` / Python-worker change for the targeted multi-execution collapse (see §10).
- No double-save and no no-save during cutover.
- Every TS message consumer (web editor, browser runner, mobile, CLI, mini-apps, timeline/sketch, chat) is explicitly migrated or assigned a documented graceful-degradation decision.

**Non-goals**
- Changing the realtime-audio fast-path (`runner.ts:45-52` / bus). It stays byte-for-byte.
- Changing the TS↔Python bridge protocol.
- Reworking the salvaged UI navigator (`groupByRun`/`NodeHistoryViewer`). It is the correct consumer; it only needs a correct feed.
- A separate `generation_started` / progress channel (out of scope; `node_update{running}` + `node_progress` already cover it).
- Persisting N artifacts for **multi-artifact-per-output-slot streaming generators** (no such node exists today; see §10 — explicitly out of scope, with a guard test).

---

## 4. The three channels

| Channel | Carries | Rate | Persisted? | Creates Generation? | Suppressible? |
|---|---|---|---|---|---|
| `node_update` | lifecycle: running/completed/error, timing, cost, property echo | 1/run | no | **no (changed)** | no |
| `generation_complete` | one complete artifact + stable variant `index` | N/run (1 per `process()` result) | **yes (drives autosave)** | **yes** | **never** |
| `output_update` | live display feed: text tokens, progressive preview snapshot, audio chunks | high (≤~50/s audio) | no | no | yes (harmless) |

### 4.1 `node_update` (unchanged shape, narrowed role)

`messages.ts:166-178` stays as-is. After this change it no longer drives autosave or generations. Everything else (status/timing/cost/property-merge/error-notification/trace) is unchanged. The `result` field becomes **advisory/back-compat only** (still the last result); consumers must not read it for **multi-execution** artifacts. It remains the graceful-degradation path for consumers that cannot be fully migrated this cycle (mobile shows 1 artifact via `result`; see §8.6) and for skip-result nodes' values (see Decision 7).

### 4.2 `generation_complete` (NEW)

```ts
export interface GenerationComplete {
  type: "generation_complete";
  node_id: string;
  node_name: string;
  node_type: string;
  /** k-th generation of this node in this run (backend-assigned, monotonic, stable). */
  index: number;
  /** The complete result dict for this artifact (same shape as a process() return). */
  outputs: Record<string, unknown>;
  /** Stamped downstream by the runner relay, NOT by the actor. */
  job_id?: string | null;
  workflow_id?: string | null;
}
```

- `index` is a **per-actor monotonic counter** (`_generationIndex++`), NOT the correlation lineage index (those reset per `(root, parentKey)` and are not a stable global variant id — see §5). A fresh actor is created per `_processGraph` and a fresh runner per job, so `index` does not collide across runs.
- `job_id` / `workflow_id` are **optional in the actor emit** and stamped uniformly downstream — see §5 and the corrected note below.
- `outputs` is the **whole result dict**, passed through unflattened. List-valued handles (`num_images=N`) stay as arrays; consumers flatten via `runVariantValues` / recursive autosave `collect` (Decision 1).
- Emitted from inside the serial actor paths, so per-node `index` ordering is deterministic.

### 4.3 `output_update` (re-scoped, + `disposition`)

```ts
export interface OutputUpdate {
  type: "output_update";
  node_id: string;
  node_name: string;
  output_name: string;
  value: unknown;
  output_type: string;
  metadata: Record<string, unknown>;
  /** NEW. "append" = value is a chunk to concatenate; "replace" = value is a whole snapshot. */
  disposition?: "append" | "replace";
  /** NEW (optional). Marks the final chunk of an append stream. */
  done?: boolean;
  workflow_id?: string | null;
}
```

`disposition` is optional for back-compat: absent ⇒ treat as `"append"` (today's behavior). Streaming chunks (text tokens, audio, genProcess yields) → `"append"`; whole non-generation values (a string into an Output node, a progressive-preview full-frame) → `"replace"`.

---

## 5. `generation_complete` emission points

Add to the actor, alongside `_emitNodeStatus`. **The actor does NOT carry `job_id`** — verified: `packages/kernel/src/actor.ts` has zero `jobId`/`job_id`/`_jobId` references, and `_emitNodeStatus` (`actor.ts:1361-1380`) emits `node_update` **without** a `job_id` field. `job_id`/`workflow_id` are backfilled for **every** outbound message at `unified-websocket-runner.ts:1855-1861` (`msg.job_id ?? active.jobId`, `msg.workflow_id ?? active.workflowId`). A new `type` inherits this for free. (The browser path must apply the same backfill; see §8.5.) `node_name` mirrors `node_update`: `this.node.name ?? this.node.type` — **not** `this.node.data?.title`.

```ts
private _generationIndex = 0;  // new field near _latestResult (actor.ts:157)

private _emitGenerationComplete(outputs: Record<string, unknown>): void {
  this._emitMessage({
    type: "generation_complete",
    node_id: this.node.id,
    node_name: this.node.name ?? this.node.type,   // mirror _emitNodeStatus
    node_type: this.node.type,
    index: this._generationIndex++,
    outputs
    // NO job_id here — runner relay stamps it (unified-websocket-runner.ts:1855-1861)
  });
}
```

Wire it at **each completed `process()`-result boundary** — the same sites where `_latestResult` is assigned:

| # | `actor.ts` site | mode | rule |
|---|---|---|---|
| 1 | after `:1000` (correlated `process()`) | one per ready key → **N/run for a generator** | the primary 6×-collapse fix |
| 2 | after `:1290` (controlled-loop `process()`) | one per `"run"` control event | |
| 3 | after `:369` (streaming-input legacy `process()`) | once | also the path Python `is_streaming_input` nodes take (see §10) |
| 4 | after `:994` (`genProcess` **stream-end**) | **ONCE per stream**, using final `_streamingCollectedOutputs` — **NOT** per yield at `:987` (yields are chunks → stay `output_update`) | if also correlation-driven, reached once per key (correct). **Load-bearing invariant — see below.** |
| 5 | after `:357` (streaming-input `run()`) | once, `nodeOutputs.collected()` | **TS-only**; Python nodes never reach `run()` (see §10). Parity-complete spot for filters/transforms; low priority |

**Load-bearing invariant for site #4 (genProcess stream-end).** `_streamingCollectedOutputs` is an **overwrite-merge**, not a concatenation: `actor.ts:984` does `Object.assign(this._streamingCollectedOutputs, routed)`, and `:994` takes `{...this._streamingCollectedOutputs}`. Therefore the stream-end dict holds the **last value written to each output slot**, not all N values streamed through that slot. The "once at stream-end" rule is correct **iff the generator's final accumulated dict holds the complete artifact** — true for nodes that emit a final whole-value yield (Summarizer-style: a terminal `{text, output}` consolidating yield; audio-with-`done`). It is **wrong** for a hypothetical generator that streams N distinct savable artifacts on the **same output slot** with no consolidating final yield — that would commit only artifact N (the exact collapse bug this RFC kills, reappearing on the streaming path). No such node exists today (e.g. `ListGenerator` yields per-item `{item, index}`, but its items propagate downstream as iteration-correlation envelopes that fire consumers N times → the N `generation_complete` land on the **consumer** at site #1, not on the generator, whose own timeline is not a savable sink). We **scope multi-artifact-per-slot streaming generators OUT** (§3 non-goal, Decision 1 corollary) and add a guard test (§13) asserting the documented limitation so a future node author hits a failing test, not a silent data loss.

Constraints:
- **Never** routed through the `runner.ts:1280` edge-suppression — `generation_complete` goes straight out via `_emitMessage → _emit` (`runner.ts:999-1001, 1688-1708`).
- **Not audio-dropped** — do NOT route it through the `isAudioChunkOutputUpdate` drop (`runner.ts:1696-1703`). It is pushed into `_messages` (which is **truncated** past `MAX_RETAINED_MESSAGES = 10_000` via `slice` at `runner.ts:1697-1700` — see §15 on what that does and doesn't guarantee).
- No new backpressure: same fire-and-forget path as `node_update`, rate bounded by result count (low), does not touch inbox flow-control.
- Skip-result parity: for `nodetool.constant.*` / `nodetool.input.*` (the `skipResult` set at `actor.ts:437-439`), do **not** emit `generation_complete` — those aren't generators. How their values still reach display sinks is specified in Decision 7.

---

## 6. `output_update` re-scope

- **`disposition` drives append vs replace.** `runner.ts:1286-1294` sets `disposition: "append"` for streaming chunks (genProcess yields, audio), `"replace"` for whole-value emits. Every frontend consumer branches on it instead of hardcoding append (see §8.7 — there are **5** `setOutputResult` call sites, not 1), fixing the progressive-preview latent bug.
- **Ephemeral clearing lifecycle.** The `outputResults` buffer (`ResultsStore.ts:609-694`, keyed `${wf}:${job}:${node}`) is cleared (a) on run start (existing `clearResults`/`clearOutputResults` at `:424-443`) and (b) on `generation_complete` for that `(wf, job, node)` artifact — once the artifact is committed as a generation, its live scratch buffer is stale. This keeps the display buffer from leaking partial chunks into the settled view.
- **Edge-suppression is now harmless.** No correctness depends on `output_update` reaching anyone — artifacts travel on `generation_complete`. The `runner.ts:1280-1284` data-edge skip and the `always_emit_output_updates` opt-out remain as-is; they now only affect cosmetic live display, never persistence or variant counts.
- **Audio path unchanged.** `isAudioChunkOutputUpdate` (`runner.ts:45-52`), the live-stream-without-retention fast-path (`runner.ts:1704-1706`), `queueAudioAppend` / `publishRealtimeAudioChunk` (`workflowUpdates.ts:513-523`), `realtimeAudioChunkBus.ts`, `AudioOutBody.tsx`, `useRealtimeAudioPlayback.ts` — all untouched. Audio chunks are `disposition: "append"` and never become generations.
- **Do not narrow `value` to chunk-only.** Display sinks legitimately render whole non-generation values (a string into an Output node, chat string-streaming). Keep `value: unknown`.

---

## 7. Autosave cutover (server path)

**Move autosave from `node_update{completed}` to `generation_complete`** — a **hard switch, not dual-write**:

1. Add `generation_complete` to the processing gate at `unified-websocket-runner.ts:1889-1892` so it gets node-type resolution, constant/input skip, and normalization.
2. New branch (parallel to the deleted one), autosave **before** normalize (normalize strips inline bytes):
   ```ts
   if (outbound.type === "generation_complete") {
     const meta = this.getNodeMetadata?.(nodeType);
     if (meta?.auto_save_asset && outbound.outputs != null) {
       await autoSaveAssets(outbound.outputs as Record<string, unknown>, {
         userId: this.userId ?? "1",
         workflowId: active.workflowId,
         jobId: active.jobId,
         nodeId: String(outbound.node_id ?? ""),
         textOutputName: primaryTextOutputName(meta)
       });
     }
     // then: normalizeOutputValue(outbound.outputs) — mirror :1958 on .outputs
   }
   ```
3. **Delete** the `node_update` autosave at `unified-websocket-runner.ts:1932-1953` in the **same commit**.

**Why hard-switch and not dual-write (corrected rationale).** The original draft justified the hard switch by claiming the last-result object is a *different instance* on the two channels and would therefore double-save. **That is inverted.** Verified at `actor.ts:1000`/`:1290`: `this._latestResult = outputs` assigns the **same object reference** that `_emitGenerationComplete(outputs)` would carry — so on the `process()`/correlated path, `node_update.result` and the run-#N `generation_complete.outputs` are the **same instance**, and the reference-based idempotency guard (`autoSaveAssets:468` keys on the in-place `asset_id` mutation at `:518-520`) would make a dual-write a **no-op** for that shared object, not a double-save. The genuine fresh-object case is the **`genProcess` path** (`:994` does `{...spread}`), where the guard cannot see the prior save across channels.

The hard switch is still **required**, for two real reasons:
- **(a) Under-save, not double-save, is the dominant risk.** Runs `1..N-1` of a multi-execution node exist **only** on `generation_complete` — `node_update` collapses to the last. A dual-write therefore under-saves the early runs regardless of object identity; the new channel must own autosave outright.
- **(b) Cross-channel idempotency is reference-based and partial.** It protects only the **shared** last-result object on the `process()` path; it does **not** protect the `genProcess` fresh-spread path, where dual-write **would** double-save the final stream-end artifact.

Atomic swap is the only clean option. (If a dark-launch is mandated, gate both with one flag, never both ON.)

**Asset-volume / parity.** A 6-image run now persists 6 assets (was 1), each tagged `node_id`, `job_id`. The consumer de-dupes by **`jobId`**: `mergeGenerations` (`nodeGenerations.ts:74-82`) drops live gens whose `jobId` already persisted, and all N variants share one `jobId`, so live N + persisted N collapse to N (not 2N). `useNodeResultHistory.lastJobAssets` (`useNodeResultHistory.ts:75-81`) already returns N assets for the last job → N tiles. The `job_update{completed}` asset reload (`workflowUpdates.ts:712-725`) now surfaces all N correctly. **Note:** persisted assets carry no `index` (§2), so `mergeGenerations` groups purely by `jobId`; this is sufficient for the live/persisted collapse but means **replay idempotency must be addressed at the autosave layer** (§15 / Decision 8). **Storage volume note:** flagged in §15 — runs that previously discarded intermediates now persist them; confirm desired for high-N generators (e.g. a 100-frame batch).

---

## 8. Frontend rewiring (all consumers)

A census of every `node_update` / `output_update` consumer (`grep` across `packages/`, `web/`, `mobile/`) yields the surfaces below. The original draft covered only §8.1–§8.4; §8.5–§8.10 are the surfaces the consumer census surfaced.

### 8.1 `workflowUpdates.ts` reducer (web editor — primary)
- **`node_update` branch (`:866-1044`):** keep all lifecycle (error notification/state/ErrorStore/trace at `:881-920` except the generation write; status/timing/cost at `:931-974`; property-merge at `:1016-1043`). **DELETE the `completed → upsertLiveGeneration` write at `:986-998`.** Keep a lightweight `running → upsertLiveGeneration({status:"running"})` placeholder (`:982-985`) so a node shows a spinner before its first artifact (`generation_complete` only fires at commit). The `node_update{error}` → generation write (`:894-901`) **stays on `node_update`** (lifecycle owns errors; `generation_complete` represents committed artifacts only — see Decision 1). **Both the `running` placeholder and the `error` settle are index-less patches** — see §8.2 for how they route in the index-keyed store, and §9 for silent-scrub gating that must cover the `running` write too.
- **`output_update` branch (`:499-547`):** becomes display-only. Branch on `disposition` instead of hardcoded `append=true` at `:515`. Audio fast-path + logging + trace unchanged.
- **NEW `generation_complete` branch:** the sole generation driver. Appends/replaces by `index`, absorbs the silent-scrub gate (§9), clears the ephemeral `outputResults` buffer for the artifact.

### 8.2 `ResultsStore.upsertLiveGeneration` (`:496-558`) — **DELETE the variant-inference, define index-less routing**
- **DELETE** the Tier-2 "second completed appends a variant" hack: `startsNewVariant` (`:522-525`) + the synthesized-variant-id append branch (`:527-548`, the `${jobId}#${variantCount}` scheme at `:535`).
- **DELETE** the `isSilentJob`-in-upsert special case (`:519` + its comment `:514-518`). Silence moves to the message handler (§9).
- **REPLACE** the matcher with **append/replace-by-`index`** keyed `${workflowId}:${nodeId}`. `generation_complete{index:k}` → set/replace slot `k`, id `k===0 ? jobId : ${jobId}#${k}` (preserve the back-compat id scheme — `selected_generation` values and tests depend on it). `getLiveGenerations` (`:563-564`) read API unchanged.
- **Index-less-patch contract (NEW — addresses the under-specified seam).** The surviving `node_update{running}` placeholder and `node_update{error}` settle carry **no `index`**. Specify: *a patch without `index` targets the newest slot for that `jobId`* — i.e. retain the existing `findLastIndex(g => g.jobId === jobId)` fallback (`:507`) **only** for index-less patches, while any `generation_complete` patch supplies an explicit `index` and uses index-keyed set/replace. This guarantees a node that errors before committing any artifact (no `generation_complete`, correct per Decision 1) still has its `running` placeholder settled by the index-less `error` patch — otherwise the index-keyed store has no slot for it and leaves a stuck `running` generation.

### 8.3 Preview / Output / content-card (web editor)
- **`PreviewNode.tsx` (`:235-298`):** **DELETE** the "accumulate `output_update`s as a variant array" reliance (the contract documented at `:235-242`). Preview reads its **source** node's generations via the value edge — `useNodeResultHistory(incomingValueEdge.source)` (already wired at `:277-284`) / `useNodeGenerations` of the source — for discrete artifacts; `streamBuffer` (`output_update`) only for live text/audio. The `sourceFallbackValue` path becomes primary.
- **`OutputNode.tsx` (`:239-249`):** structurally unchanged — already layers `streamBuffer ?? settledValue`. Stream for live, generation (`useNodeGenerations().current`) for settled.
- **`ContentCardBody.tsx` (`:600-617`):** already generation-driven via `useNodeResultValue`/`useNodeResultHistory`. Its `resolvePreviewValue` array-flatten (`:281-301`) is now redundant for settled artifacts (`runVariantValues` covers N tiles); it still services the live in-flight buffer, so it stays.

### 8.4 SALVAGED UI — fed correctly, **zero code change**
`utils/nodeGenerations.ts` (`groupByRun`/`getCurrentRun`/`RunGroup`/`runVariantValues`/`mergeGenerations`/`assetToGeneration`), `useNodeGenerations` (`{runs, currentRun}`), `NodeHistoryViewer` (the runs/variants/single navigator, `defaultView` flips to grid at `variants.length > 1`, `:269-270`), `useNodeIO`, `nodeGenerationAccessor`, `useNodeExecState`. These already expect `index`-keyed variants under a stable `jobId`; they just receive a clean feed instead of the `node_update` collapse.

### 8.5 In-browser execution path — **normalize + autosave branches REQUIRED** (was omitted)
The dual-run-path architecture runs the **same `packages/kernel`** in a Web Worker, so `generation_complete` **is emitted in-browser too**. Two gaps:
- **Normalize.** `browserRunner.worker.ts:187-203` (`attachPreviewBitmaps` / `resolveImageRefForTransport`) and `browserWorkflowRunner.ts:435-441` (`materializeBrowserOutputs` / `resolve`) currently materialize **only** `node_update.result` and `output_update.value`. **Add a `generation_complete` branch in both** that applies the same resolve + materialize to `.outputs` (GPU read-back, raw-RGBA→PNG, inline-bytes→uri), or in-browser `generation_complete` carrying GPU refs / inline bytes renders broken and bitmaps are not transferred. The `:432` "render identically" guarantee depends on it.
- **Autosave.** `autoSaveAssets` exists **only** in `unified-websocket-runner.ts` — the entire `web/src/lib/workflow/` directory calls it **nowhere** (verified: zero matches). So in-browser generative runs do not persist via this code. **Decision required (Decision 9):** either (a) add a browser-side autosave hook keyed on `generation_complete` mirroring the server branch, or (b) confirm+document that browser-path persistence already round-trips to the server (the `job_update{completed} → invalidateQueries(['assets']) + loadWorkflowAssets` reload at `workflowUpdates.ts:712-725` assumes the server already saved). The "every committed artifact is persisted" goal is **unproven for the browser path** until this is resolved; the rollout's "each step shippable and green" claim is **false for browser-eligible workflows** until §8.5 lands. The silent-scrub case runs in-browser (§9), so this is on the critical path.
- **Backfill.** Confirm the browser relay applies the same `job_id`/`workflow_id` stamping the server does at `unified-websocket-runner.ts:1855-1861`; the bare actor emit (§5) relies on it.

### 8.6 Mobile (`mobile/src/stores/WorkflowRunner.ts`) — **add a case, decide degradation**
Independent reducer: reads `node_update.result` (`:354-359`) and `output_update.value` (`:384-396`) into one `nodeResults` map; reads `node_update` only for errors otherwise. After this change, mobile keeps working at **1-artifact-per-node** via `node_update.result` (the advisory last-result), which is acceptable graceful degradation. **Required:** (1) add a `generation_complete` case to the `WorkflowRunner.ts` switch — minimally store `.outputs` into `nodeResults` so multi-execution shows at least the latest, ideally a variant list if mobile surfaces variants; (2) regenerate `mobile/src/api.ts` message-type table (it currently has a generated `output_update`/`node_update` union with no `generation_complete`, `:5005+`); (3) state explicitly (Decision 10) that mobile's continued read of `node_update.result` is an **intended** degradation, not an accident. Mobile is intentionally NOT a root workspace; build `protocol` first before its typecheck.

### 8.7 `setOutputResult` append/replace plumbing — **5 call sites, not 1**
`disposition` must thread through `ResultsStore.setOutputResult`'s boolean `append` param. Verified call sites (excluding tests): `workflowUpdates.ts:515`, `core/chat/chatProtocol.ts:514`, `hooks/timeline/useGenerateClip.ts:186`, `hooks/sketch/useGenerateLayer.ts:227`. The original draft named only the first two. The timeline/sketch `forwardWorkflowMessage` paths call `setOutputResult(..., true)` unconditionally, so a `disposition:"replace"` value there would still append — re-introducing the exact progressive-preview bug elsewhere. **Fix:** change `setOutputResult` to take `disposition` (or derive `append` from it) and thread it through **all four** runtime call sites. (`utils/imageRef.ts:51` is only a doc comment; update it too.)

### 8.8 Timeline & Sketch generation (`useGenerateClip.ts`, `useGenerateLayer.ts`) — **migrate asset extraction**
Both share an identical pattern that makes `output_update` **load-bearing for production asset extraction**: on each message they `jobOutputs.set(jobId, normalizeOutputUpdateValue(...))` gated on `node_id === context.selectedOutputNodeId` (`useGenerateClip.ts:204-209`, `useGenerateLayer.ts:248-253`), then at `job_update{completed}` call `extractAssetId(jobOutputs.get(jobId))` (`useGenerateClip.ts:228-235`) and **mark the whole job FAILED** ("finished without producing an output asset") if absent. Output nodes are terminal (no outgoing data edge) so `output_update` survives suppression *today*, but the new contract makes this a freely-droppable display artifact. **Migrate** the `selectedOutputNodeId` extraction from `output_update` to `generation_complete.outputs` (authoritative, never suppressed); keep `output_update` only for live preview inside the editors. This is the production path for both the video timeline and the sketch editor — it must move, not just honor `disposition`.

### 8.9 Mini-apps (`web/src/components/miniapps/hooks/useMiniAppRunner.ts`) — **migrate result tiles**
Mini-app result tiles are built **entirely** from `output_update`: `:84-103` creates one `MiniAppResult` per `output_update` (id `node_id:output_name:timestamp`) → `upsertResult`; `node_update` is read only for errors (`:105-119`). Under the new contract `output_update` is no longer the artifact carrier, so mini-app lists become incomplete/empty for edge-connected generators. **Switch** `MiniAppResult` construction to `generation_complete.outputs` (flatten per output handle for committed artifacts); keep `output_update` only for live-streaming display within a result. Mini-apps are a first-class surface.

### 8.10 Chat / agent path (`web/src/core/chat/chatProtocol.ts`)
`chatProtocol.ts` independently consumes `node_update` (`:1263`) and `output_update` (`:1294` → `applyOutputUpdate` at `:492-521`); it has **no** `upsertLiveGeneration` / generation path (only `content_metadata.media_generation` chunk handling at `:430`). Two requirements: (1) `applyOutputUpdate` must honor `disposition` (same demotion as §8.1; chat string-streaming at `:523+` stays as legitimate whole-value display); (2) **explicitly decide** (Decision 11) whether the chat surface creates variants for a multi-execution generator invoked from a workflow tool, or **intentionally ignores `generation_complete`** (display-only). Recommend the latter for this cycle — document it — rather than leaving it implicit in a one-line note. If chat later needs variants it gets its own `generation_complete` branch.

### 8.11 CLI (`packages/cli/src/websocket-client.ts`)
Protocol consumer used by `nodetool workflows run --json` and piped chat: handles `node_update` (`:398-403`, surfacing `result`) and `output_update` (`:405-411`, surfacing `value`); no `generation_complete` case. After the change a 6-image CLI run reports 1 collapsed result via `node_update` and the variants exist only on a type the CLI ignores. **Decide (Decision 12):** surface `generation_complete` events in the JSON stream (one event per artifact) or aggregate them; add the message-type entry to the CLI union (`:36-38`). Lowest-priority consumer but must not silently drop variants from `--json` output.

---

## 9. Silent-scrub handling

`useLiveSliderWriter` reuses **one** `jobId` for an entire scrub, marks it silent (`markJobSilent`), and emits a `running→completed` arc **per frame** (`runBrowserGraphJob({ jobId: previewJobIdRef.current })`). Under the new model each frame emits `generation_complete` with incrementing `index` → without a gate, a 60-frame scrub = 60 variants. **This runs in-browser** (§8.5), so the browser-path normalize/autosave branches must exist for it.

**The gate relocates from `ResultsStore.upsertLiveGeneration:519` into the new `generation_complete` handler in `workflowUpdates.ts`** (frontend gate, Decision 2). **Both** writers that fire per scrub frame must honor it:

```ts
// in the generation_complete handler:
const slot = isSilentJob(jobId) ? 0 : index;   // pin scrub frames to slot 0
upsertLiveGeneration(wf, node, jobId, { index: slot, outputs, status: "completed" });
```

```ts
// in the node_update{running} placeholder write (§8.1) — also fires per scrub frame:
const slot = isSilentJob(jobId) ? 0 : undefined; // index-less for non-silent (newest-slot)
upsertLiveGeneration(wf, node, jobId,
  slot === 0 ? { index: 0, status: "running" } : { status: "running" });
```

`isSilentJob` is already imported in `workflowUpdates.ts:37`. `previewJobs.ts` and `useLiveSliderWriter` are unchanged. **Both halves matter:** §8.2 deletes the `isSilentJob` special-case from `upsertLiveGeneration`, so if the per-frame `running` placeholder does not also pin slot 0, it would append/churn variants via the index-less newest-slot fallback. The covering test `ResultsStore.variants.test.ts:154-183` (running→completed PER frame, 8 frames → 1 generation) relocates to a `generation_complete`-handler test that **drives running + generation_complete per frame for 8 frames** and asserts 1 live gen.

Keep the kernel dumb (always increment `index`); silence is a pure slider-preview UI concern, so the gate lives frontend-side. The browser runner already owns the jobId; we do not push a `silent` flag into the kernel.

---

## 10. Python parity — **VERDICT: TS-only for the targeted collapse. Zero `nodetool-core` change.**

Python nodes execute through the **same `NodeExecutor` interface** as TS nodes (`node-executor.ts:127-171`). `PythonNodeExecutor` implements **only** `process()` (`python-node-executor.ts:223-237`) and `genProcess()` (`:239-258`) — **never `run()`**. `process()` does the bridge RPC, calls `materializeOutputs()`, and **returns a fully-materialized plain JS dict** to the actor's `await`; `genProcess()` yields materialized partials. For Python the actor assigns these to `_latestResult` at sites `:369` (legacy single `process()`), `:994` (genProcess stream-end), `:1000` (correlated), `:1290` (controlled-loop) — **identically to TS**.

**Two corrections to the "identical sites" claim** (it was over-stated):
- **Site #5 (`run()` / `nodeOutputs.collected()`, `:357`) is TS-only.** `PythonNodeExecutor` has no `run()`; the actor's `run()` path requires `this._executor.run` (`actor.ts:286`). A Python node flagged `is_streaming_input` therefore falls into the **legacy single `process()`** branch (`actor.ts:358-371`, site #3), never site #5. So for Python, site #5 is dead and site #357 is never reached. The zero-Python-change conclusion is unaffected; the coverage claim is corrected.
- **Streaming-output multi-artifact nodes are out of scope (§5 site #4 invariant).** Python streaming-output nodes deliver every artifact as a per-yield `chunk` frame (worker `protocol.py:126-132`), and the terminal `result` is deliberately **empty** (`protocol.py:141-145`, `result_data={'outputs':{},'blobs':{}}` for `execute.stream`). So for a Python generator that yields N distinct artifacts on the **same slot**, the only place those artifacts exist distinctly is the per-yield boundary — which we route to display-only `output_update`. The genProcess stream-end `generation_complete` would carry only artifact N. **We scope this out** (§3, Decision 1 corollary) rather than fix it, because the faithful fix would require the wire to distinguish a "complete artifact" yield from a progressive chunk — a `final`/`complete` marker on `chunk` frames — which **would** require a `nodetool-core` (`worker/protocol.py`) change, contradicting the zero-Python-change goal. No such node exists today; the §13 guard test documents the limitation.

The bridge is **pure request/response RPC** keyed to `request_id` (`python-bridge-base.ts:172-267`) — it emits no `node_update`/`output_update`/generation/autosave concept. **Therefore `generation_complete` is emitted entirely in the TS `NodeActor`.** Python nodes get it for free for the targeted multi-execution collapse (the 6× `ListGenerator→TextToImage` case is a pure TS-actor correlated-drain phenomenon). No `packages/protocol` Python mirror, no `bridge-protocol.ts` change, no worker change. **Python-side scope: none.**

---

## 11. Protocol / serialization changes & full touch-point list

**msgpack is schemaless on both ends** — server encodes with `msgpackr` `pack` (`unified-websocket-runner.ts:7,1229`), client decodes with `@msgpack/msgpack` `decode` (`WebSocketManager.ts:242/249`). No `addExtension` / `Packr` registry / type table anywhere. **Any new `type` string round-trips for free; zero msgpack change.** There is no zod schema for the streaming `ProcessingMessage` union (the `api-schemas` zod is REST chat-thread only) — **zero zod change.**

Touch points (expanded to all consumers):
1. **`packages/protocol/src/messages.ts`:** add `interface GenerationComplete` (after `:178`); add to the `ProcessingMessage` union (`:633-653`) — auto-flows into `MessageType`/`MessageOfType`, re-exported via `index.ts:5`. Add `disposition?` + `done?` to `OutputUpdate` (`:201-210`).
2. **`packages/kernel/src/actor.ts`:** `_emitGenerationComplete` (bare, no `job_id`; `node_name = node.name ?? node.type`) + the 4–5 emit sites (§5); `_generationIndex` field.
3. **`packages/kernel/src/runner.ts`:** set `output_update.disposition` at `:1286-1294`; ensure `generation_complete` is retained (not audio-dropped) in `_emit` (`:1688-1708`).
4. **`packages/websocket/src/unified-websocket-runner.ts`:** add `generation_complete` to the processing gate `:1889-1892`; new autosave + normalize branch; delete `node_update` autosave `:1932-1953`. (Backfill at `:1855-1861` already stamps `job_id`/`workflow_id` — no change.)
5. **`web/src/lib/workflow/browserRunner.worker.ts` + `browserWorkflowRunner.ts`:** add `generation_complete` normalize/materialize branches (§8.5); confirm `job_id` backfill; add/confirm browser-path autosave (Decision 9).
6. **`web/src/stores/workflowUpdates.ts`:** new `generation_complete` branch + silent-scrub gate (both writers); demote `output_update` to disposition-aware; delete `completed→upsertLiveGeneration` from `node_update`.
7. **`web/src/stores/ResultsStore.ts`:** rewrite `upsertLiveGeneration` to append/replace-by-`index` with the index-less-patch contract; change `setOutputResult` to disposition-aware.
8. **`web/src/core/chat/chatProtocol.ts`:** `applyOutputUpdate` honors `disposition`; documented `generation_complete` decision (Decision 11).
9. **`web/src/hooks/timeline/useGenerateClip.ts` + `web/src/hooks/sketch/useGenerateLayer.ts`:** migrate asset extraction to `generation_complete.outputs`; thread `disposition` through their `setOutputResult` calls.
10. **`web/src/components/miniapps/hooks/useMiniAppRunner.ts`:** build result tiles from `generation_complete.outputs`.
11. **`mobile/src/stores/WorkflowRunner.ts` + `mobile/src/api.ts`:** add `generation_complete` case; regenerate message-type union; document `node_update.result` degradation (Decision 10).
12. **`packages/cli/src/websocket-client.ts`:** add `generation_complete` to the union and the JSON event stream (Decision 12).

---

## 12. Rollout plan

Ordered, each step shippable and green **on both run paths** (the original draft was green only for the server path):

1. **Protocol additive (no behavior change).** Add `GenerationComplete` to the union + `OutputUpdate.disposition?`/`done?`. Build `protocol`. Nothing emits or consumes it yet. *Back-compat: optional fields, additive union member — old clients ignore the new `type`.*
2. **Kernel emits *bare* `generation_complete`** at the 4–5 sites — **no `job_id` and no `index`** (per D8, both are stamped downstream: the server persist/relay seam derives `index` from DB ordering; the browser relay assigns an arrival-order `index`). Set `output_update.disposition`. Relay it through **both** the websocket (gate `:1889-1892`, backfill `job_id`+`index`, normalize `.outputs`) **and** the browser worker (assign arrival-order `index`, normalize `.outputs`, §8.5) **without** autosave yet. No consumer reacts → no behavior change. Add kernel emission tests (incl. the genProcess stream-end guard test).
3. **Frontend consumes `generation_complete`** (new reducer branch + `upsertLiveGeneration` rewrite incl. index-less-patch contract + silent-scrub gate on both writers). **Delete** the `node_update{completed}→upsertLiveGeneration` write and the ResultsStore Tier-2 hack **in the same commit**. Migrate `PreviewNode`, mini-apps, timeline/sketch asset extraction, and mobile in the same wave (each is independently testable but must not be left reading the demoted channel for artifacts). Now the timeline shows N variants live.
4. **Autosave hard-switch.** Add the `generation_complete` autosave branch and delete the `node_update` autosave **atomically** on the server (§7); land the **browser-path persistence decision** (Decision 9) in the same step. Now N assets persist on whichever paths are in scope.
5. **Demote `output_update` display** (disposition-aware append/replace across all 5 `setOutputResult` sites + `chatProtocol.ts`; ephemeral-clear on `generation_complete`). Cosmetic.
6. **Cleanup:** remove the now-dead `node_update.result`-as-artifact reads where a consumer fully migrated; tighten comments. (`node_update.result` survives as the documented mobile/skip-result degradation path.)

**Safe cutover sequence:** steps 1–2 are invisible (additive + emit-only on both paths). Step 3 swaps the generation driver in one commit. Step 4 swaps the autosave driver in one commit. Never run both drivers of either {generations, autosave} simultaneously.

**Client/server version skew (NEW).** Steps 1–2 (old-client/new-server) degrade safely — an old client ignores the new `type` and shows the old 1-variant behavior. The genuine risk is **new-client/old-server**: step 3 deletes the client's `node_update{completed}→upsertLiveGeneration` write, but an old server never emits `generation_complete` → **generations disappear entirely**. Electron bundles client+server in lockstep (verified: `web` and `websocket` both `0.7.0-rc.23`), so in-process is safe. **For any remote `nodetool serve` deployment where web and the websocket server version independently, gate the step-3 deletion behind a server-capability probe, or keep the `node_update` generation write until the server is known to emit `generation_complete`.** The optional `NODETOOL_GENERATION_EVENTS` flag stages a same-process cutover but does **not** cover client/server version skew. *(Open — see §15.)*

---

## 13. Test plan

**Kernel emission (`packages/kernel`):**
- Correlated 6× generator (`ListGenerator→TextToImage`) emits exactly 6 `generation_complete` with `index` 0–5, each distinct `outputs`, **one** `node_update{completed}`.
- Controlled-loop node emits one per `"run"` event.
- `genProcess` node with a final whole-value yield: N `output_update{disposition:"append"}` yields + **exactly one** `generation_complete` at stream-end carrying the **consolidated** value (assert NOT per-yield, assert value is complete).
- **Guard test (documented limitation):** a `genProcess` node whose last yield does **not** carry the full value (overwrite-merge on one slot) loses prior content in the single `generation_complete` — assert this so a future multi-artifact-per-slot streaming node author hits a failing test, not silent loss.
- `genProcess` under correlation (multiple keys): one `generation_complete` per key.
- `nodetool.constant.*` / `nodetool.input.*` emit **no** `generation_complete`.
- `generation_complete` is never edge-suppressed (intermediate generator feeding a Preview still emits it) and never audio-dropped.
- Actor emit carries no `job_id`; assert the runner relay stamps it (server **and** browser paths).

**Autosave (`packages/websocket`):**
- 6-gen run → 6 `Asset` rows, each with correct `node_id`/`job_id`.
- No double-save: assert `node_update{completed}` no longer triggers `autoSaveAssets`.
- **Replay idempotency:** re-emitting a **fresh** `generation_complete` object (asset_id unset, as a real reconnect would) is a no-op — requires the `(job_id, node_id, index)` guard from Decision 8, NOT just per-object `asset_id`. (Today's per-object guard would duplicate.)
- Text-output autosave still fires off `generation_complete.outputs`.

**Browser path (`web`):**
- In-browser `ListGenerator→TextToImage→Preview` end-to-end: 6 normalized variants render (assert `generation_complete.outputs` materialized — no broken images), and persistence matches Decision 9.

**Reducer / store (`web`):**
- `generation_complete{index:0,1,2}` → 3 variants (rewrite `ResultsStore.variants.test.ts:34-66`).
- Index-less patch routing: `node_update{running}` then `node_update{error}` with **no** intervening `generation_complete` settles to exactly **one errored** generation (no stuck `running`).
- `disposition:"append"` concatenates; `"replace"` overwrites the display buffer — assert across `workflowUpdates`, `chatProtocol`, `useGenerateClip`, `useGenerateLayer`.
- `node_update{completed}` no longer mutates `liveGenerations`.
- `mergeGenerations` collapses live N + persisted N (same jobId) → N.

**Silent-scrub:** 8 scrub frames, each driving `node_update{running}` **and** `generation_complete` under one silent jobId → **1** live generation (relocated from `ResultsStore.variants.test.ts:154-183`; covers both writers).

**Consumer surfaces:** mini-app result list shows N tiles for a multi-execution generator; timeline/sketch extract the asset from `generation_complete.outputs` (not `output_update`); mobile shows ≥1 artifact via the new case; CLI `--json` emits N `generation_complete` events.

---

## 14. DECISIONS TO LOCK

### Status — locked 2026-06-20
- **D1** ✅ A — per-`process()` boundary; multi-artifact-per-output-slot streaming generators out of scope.
- **D8** ✅ B (refined) — `index` from **DB ordering**, assigned at the persist/relay seam (not the actor).
- **D9** ✅ Provider-generations only, **always server-side**; **no** browser autosave; browser normalize mandatory.
- **D10** 🔶 Provisional — mobile gets the `generation_complete` case + data now; full variant UI fast-follow (awaiting confirm).
- **D11** ✅ B — chat shows variants.
- **D2, D3, D4, D5, D6, D7, D12** ✅ accepted as recommended.

**Decision 1 — Generation boundary & list handling.**
Options: **A)** one `generation_complete` per `process()` result; list-valued handles carried as arrays, consumers flatten (`runVariantValues` / recursive autosave collect). **B)** fan a list-valued result into one `generation_complete` per element in the actor.
**Recommend: A** — the actor already hands whole result dicts to `_sendOutputs`; passing the same dict avoids teaching the actor per-handle list semantics, and `runVariantValues` + `autoSaveAssets`'s recursive `collect` (`:448-464`) already flatten. **Corollary (errors):** keep node-level errors on `node_update{error}`; `generation_complete` represents committed artifacts only (no error variant in the shape). A run that errors before committing emits no `generation_complete` — correct. **Corollary (streaming):** the genProcess stream-end `generation_complete` carries the overwrite-merged `_streamingCollectedOutputs`, so multi-artifact-per-output-slot streaming generators are **out of scope** (§5/§10); guard-tested in §13.
**DECIDED: A** — confirmed, including the streaming scope-out (multi-artifact-per-output-slot streaming generators are not covered this cycle; documented + guard-tested).

**Decision 2 — Silent-scrub gate location & mechanism.**
Options: **A)** backend pins `index=0` for silent jobs (kernel must learn "silent"). **B)** frontend gate in the `generation_complete` handler **and** the `node_update{running}` placeholder: `isSilentJob(jobId)` → pin slot 0, else append by `index` (or newest-slot for index-less running/error).
**Recommend: B** — silence is a pure slider-preview UI concern; the kernel stays dumb. The gate must cover **both** per-frame writers (generation_complete and the running placeholder), since §8.2 removes the `isSilentJob` special-case from `upsertLiveGeneration`. `isSilentJob` already imported in `workflowUpdates.ts:37`.

**Decision 3 — Autosave cutover.**
Options: **A)** dual-write (both `node_update` and `generation_complete` autosave during migration). **B)** hard switch (delete old, add new in one commit).
**Recommend: B** — **corrected rationale:** runs `1..N-1` exist **only** on `generation_complete` (node_update collapses to the last), so dual-write under-saves the early runs regardless; and the cross-channel `asset_id` idempotency guard is **reference-based** — it protects the shared last-result object on the `process()` path (same instance at `actor.ts:1000/1290`, so dual-write would be a no-op there, NOT a double-save as the draft claimed) but does **not** protect the `genProcess` fresh-spread path (`:994`), where dual-write **would** double-save the final artifact. Atomic swap is the only clean option. (If a dark-launch is mandated, gate both with one flag, never both ON.)

**Decision 4 — `output_update.disposition` + ephemeral lifecycle.**
Options: **A)** add `disposition: "append" | "replace"` (+ optional `done`); clear the buffer on run-start and on `generation_complete` for that artifact; thread `disposition` through **all 5** `setOutputResult` call sites. **B)** keep hardcoded append; clear only on run-start.
**Recommend: A** — fixes the progressive-preview latent bug (`workflowUpdates.ts:515` always-append) and makes whole-value snapshots correct. Absent `disposition` defaults to `"append"` for back-compat. Note the call-site count: `workflowUpdates.ts:515`, `chatProtocol.ts:514`, `useGenerateClip.ts:186`, `useGenerateLayer.ts:227` — missing any re-introduces the bug in that consumer.

**Decision 5 — Keep the name `output_update` vs rename.**
Options: **A)** keep `output_update`. **B)** rename to `display_update` / `output_chunk`.
**Recommend: A** — renaming churns the protocol union, both web reducers, `chatProtocol.ts`, mobile, CLI, the relay, and every display-sink component for a cosmetic gain; the `disposition` field already encodes the honest semantics. Revisit only if a future cleanup pass touches all sites anyway.

**Decision 6 — Do connected content-card/text nodes still emit `output_update` for live streaming?**
Options: **A)** yes — keep emitting for live token/preview display (now purely cosmetic). **B)** stop emitting for edge-connected handles (rely only on `generation_complete`).
**Recommend: A** — live token streaming and progressive previews are real UX that `generation_complete` (fires only at commit) can't provide. Edge-suppression already trims the firehose where it matters; the surviving emits are harmless display. Keep them.

**Decision 7 — How do `constant`/`input`/`skipResult` node values reach display sinks?**
Context: §5 skips `generation_complete` for `nodetool.constant.*` / `nodetool.input.*`; `node_update.result` is demoted to advisory; `output_update` is suppressible on edge-connected handles. That risks a value on none of the three authoritative channels.
Options: **A)** these nodes' downstream **consumers** are what emit `generation_complete` (the constant/input value flows as an input, and the consuming node commits its own artifact) — the constant/input node itself has no savable artifact and needs none; client-authored constants are already in the graph state, and server-resolved inputs surface via their consumer. Keep `node_update.result` as the **explicit** display fallback for the rare standalone constant/input preview. **B)** emit `generation_complete` for these too.
**Recommend: A** — but **state it explicitly** rather than leaving the "client already holds the values" hand-wave: a constant/input feeding a connected node has its value carried into the consumer's `generation_complete`; a standalone constant/input previewed directly reads `node_update.result` (the one sanctioned `result` read, scoped to skip-result node types). This reconciles "don't read `result` for artifacts" (multi-execution generators) with "skip-result nodes use `result`" (they have no generation).

**Decision 8 — Replay/duplicate-asset idempotency.**
Options: **A)** per-object `asset_id` guard only (today). **B)** add a persisted-layer idempotency key on `(job_id, node_id, index)` — skip autosave for an already-persisted tuple.
**Recommend: B** — a real reconnect/replay re-emits a **fresh** `generation_complete` (asset_id unset on a new object), so the reference-based guard does not fire → duplicate `Asset` rows sharing `job_id` but new ids. Since persisted assets carry no `index` today, add `index` to the autosave dedupe (either a stored column or an in-run `(node_id, index)` set per job) so replay is a true no-op. Without B, the §13 "replay is a no-op" test fails for genuine reconnects.
**DECIDED: B, refined — `index` is assigned from DB ordering at the server persist/relay seam, not by the actor.** The `unified-websocket-runner` interception that backfills `job_id` (`:1855-1861`) persists the asset, derives `index` from the DB ordering of `(job_id, node_id)`'s assets, stamps it onto `generation_complete` **before relay**, and dedupes autosave on `(job_id, node_id, index)` → replay is a true no-op. Live ordering uses the stamped DB index (available because stamping happens in the same pre-relay pass). The browser path (no persist) falls back to an arrival-order index.

**Decision 9 — Browser-path persistence.**
Options: **A)** add a browser-side autosave hook keyed on `generation_complete` mirroring `unified-websocket-runner`'s branch. **B)** confirm + document that browser-path generative runs already round-trip persistence to the server (relying on the `job_update{completed}` asset reload), and that `generation_complete` in-browser is display-only.
**Recommend: decide before step 4 ships.** The browser path calls `autoSaveAssets` **nowhere** (verified). If browser jobs do not reach the server autosave gate, option A is required or the "every committed artifact is persisted" goal fails for browser-eligible (and silent-scrub) workflows. Regardless of A/B, the browser **normalize** branch for `generation_complete.outputs` is **mandatory** (§8.5) for correct rendering.
**DECIDED: B — persistence is provider-generations only, always server-side; no browser autosave hook.** Browser/non-provider generations are display-only and not persisted. Provider calls (fal/replicate/LLM/etc.) already execute server-side, so every persistable artifact hits the server autosave gate by construction. Option A (browser autosave) is rejected. The browser `generation_complete.outputs` **normalize** branch (§8.5) remains **mandatory** for rendering; only the persistence half is dropped from the browser path.

**Decision 10 — Mobile degradation.**
Options: **A)** mobile adds a `generation_complete` case but continues to show 1-artifact-per-node via `node_update.result` (graceful degradation, no variant UI). **B)** mobile renders full variant lists from `generation_complete`.
**Recommend: A for this cycle** — state it as an **intended** degradation, regenerate `mobile/src/api.ts` types, and add the case so multi-execution at least shows the latest. Variant UI on mobile is a follow-up.
**DECIDED (provisional): add the `generation_complete` case + regenerate types now; full variant UI as a fast-follow.** Mobile shows the latest immediately and does not block the cutover. *Awaiting confirmation on whether mobile variant UI is wanted in this cycle.*

**Decision 11 — Chat/agent path & `generation_complete`.**
Options: **A)** chat ignores `generation_complete` (display-only via `output_update`/`media_generation`); document why. **B)** chat gets its own `generation_complete` → variant handling.
**Recommend: A for this cycle** — chat surfaces live media via existing chunk handling; workflow-tool multi-execution variants are not a chat UX today. Document the decision; don't leave it implicit. `applyOutputUpdate` still honors `disposition` regardless.
**DECIDED: B — chat shows variants.** Chat gets full `generation_complete` → variant handling (overrides the degrade recommendation). `applyOutputUpdate` still honors `disposition`.

**Decision 12 — CLI semantics.**
Options: **A)** surface each `generation_complete` as its own event in the `--json` stream. **B)** aggregate into the final result.
**Recommend: A** — preserves the N-artifact information the kernel now exposes; add the type to the CLI union. Lowest priority but must not silently drop variants.

---

## 15. Risks & open questions

- **Storage volume.** N-per-run autosave means previously-discarded intermediates now persist (a 100-frame batch generator writes 100 assets). Confirm desired; consider a per-node `auto_save_asset` cap or an explicit "save intermediates" flag for very-high-N generators. *(Open — needs product call.)*
- **Browser-path persistence (Decision 9).** The single biggest open item: browser jobs call `autoSaveAssets` nowhere. Until Decision 9 lands, N-asset persistence is unproven for browser-eligible and silent-scrub runs. The browser normalize branch is mandatory independent of the persistence decision.
- **Replay duplicate assets (Decision 8).** Persisted assets carry no `index`; the only dedupe is the per-object `asset_id` mutation. A reconnect re-emits fresh `generation_complete` objects → duplicate rows. Needs `(job_id, node_id, index)` idempotency at the autosave layer.
- **`_messages` truncation vs reconnect replay.** `generation_complete` is pushed into `_messages`, but `_messages` is **truncated** to `MAX_RETAINED_MESSAGES/2` past 10,000 (`runner.ts:1697-1700`) and is **not** the autosave source (autosave consumes the live relay stream in `unified-websocket-runner`, not `_messages`). Drop the draft's "`_messages` authoritative for autosave" claim. For a very-high-N reconnect, early `generation_complete` entries can be evicted from replay; persisted assets recover them via the `job_update{completed}` reload — verify the reconnect replay path preserves `index` ordering for what survives, and document that very-high-N reconnects may drop early *live* variants from replay (persisted side recovers them).
- **`running` placeholder + index-less patches.** `generation_complete` fires only at commit, so the pre-first-artifact spinner relies on the `node_update{running}→upsertLiveGeneration` placeholder; a node that errors before any artifact must be settled by the index-less `node_update{error}` patch via the newest-slot fallback (§8.2). Tested in §13.
- **`job_id`/`node_name` in the actor.** Resolved (was asserted-resolved-but-wrong): the actor has **no** `job_id`; the runner relay stamps it at `unified-websocket-runner.ts:1855-1861`. `node_name = node.name ?? node.type`, not `node.data?.title`. The browser relay must apply the same stamping.
- **Client/server version skew (§12).** New-client/old-server erases generations (client deletes the `node_update` write; old server never emits `generation_complete`). Lockstep in Electron (verified `0.7.0-rc.23`); for remote `serve`, gate the step-3 deletion behind a capability probe or keep the `node_update` write until the server is known to emit the new event.
- **`mergeGenerations` jobId coupling.** The live/persisted collapse depends on all N variants and N assets sharing one `jobId` (`nodeGenerations.ts:74-82`, `assetToGeneration` at `:58-60`). `index` must not leak into the jobId match. Verified the merge groups purely by `jobId`; confirm `assetToGeneration` keeps grouping intact when N assets land.
- **All consumers migrated.** The consumer census (§8.5–§8.11) must be complete; a missed reader of `node_update.result`/`output_update.value` as an artifact silently loses variants. Re-run the grep before sign-off.

---

## Appendix — Addressed review notes

Findings verified against the working tree; each is either incorporated above or marked corrected-as-wrong with why.

1. **Double-save rationale inverted (high) — INCORPORATED + CORRECTED.** Verified `actor.ts:1000`/`:1290` assign `_latestResult = outputs` (same ref as the would-be `generation_complete.outputs`), and the `autoSaveAssets` guard (`:468`/`:518-520`) is reference-based. The draft's "different instances → double-save" was inverted for the `process()` path (it'd be a no-op there); the real double-save risk is the `genProcess` fresh-spread path (`:994`). Rationale rewritten in §7 and Decision 3 around (a) under-save of runs 1..N-1 and (b) the genProcess-only double-save.

2. **genProcess stream-end overwrite-merge (high/critical) — INCORPORATED.** Verified `_streamingCollectedOutputs` is `Object.assign` overwrite-merge (`:984`) then `{...}` (`:994`). Stated the load-bearing invariant in §5, scoped multi-artifact-per-slot streaming out (§3, Decision 1 corollary, §10), added a guard test (§13).

3. **Index-less running/error patches into an index-keyed store (medium) — INCORPORATED.** Specified the index-less-patch contract in §8.2 (newest-slot-by-jobId fallback retained for `running`/`error`; explicit `index` only from `generation_complete`) + a §13 test for running→error-with-no-generation settling to one errored gen.

4./21. **Actor `job_id`/`node_name` wrong-as-written (high/medium) — INCORPORATED + CORRECTED.** Verified zero `job_id` in `actor.ts`; backfill at `:1855-1861`; `_emitNodeStatus` uses `node.name ?? node.type`. §5 emit snippet now omits `job_id` and uses `node.name`; §15 open question resolved.

5./15./16. **Browser path autosave + normalize gaps (critical/high) — INCORPORATED.** Verified `autoSaveAssets` only in `unified-websocket-runner`; browser normalize only handles `.result`/`.value` (`browserWorkflowRunner.ts:435-441`, `browserRunner.worker.ts:187-203`). Added §8.5, Decision 9, touch-point #5, browser test, and rollout/§3 corrections.

6./7. (Duplicate of 4 from a second reviewer.) — Same correction; consolidated.

8. **Silent-scrub running placeholder (high) — INCORPORATED.** §9 now gates **both** the `generation_complete` write and the per-frame `running` placeholder on `isSilentJob`; §13 test drives both halves per frame.

9. **`_messages` retention vs "authoritative for autosave" (medium) — INCORPORATED + CORRECTED.** Verified `MAX_RETAINED_MESSAGES=10_000` slice (`:1697-1700`) and that autosave reads the live relay, not `_messages`. Dropped the "authoritative for autosave" claim; §15 documents truncation + reconnect implications.

10. **Replay duplicate assets (medium) — INCORPORATED.** Verified `Asset` has `node_id`/`job_id` but no `index`; guard is per-object. Added Decision 8 (`(job_id, node_id, index)` idempotency) and a fresh-object replay test.

11. **New-client/old-server skew (medium) — INCORPORATED.** Verified `web` and `websocket` are lockstep `0.7.0-rc.23`. §12 documents Electron lockstep vs remote-serve risk and the capability-probe mitigation.

12./13. **Python streaming-output + streaming-input site coverage (high/medium) — INCORPORATED.** Verified `PythonNodeExecutor` implements only `process()`/`genProcess()` (no `run()`), so site #5 is TS-only and Python streaming-input uses site #3. Verified the empty terminal `result` for `execute.stream`. §10 corrected; streaming-output multi-artifact scoped out.

**Critical (mobile)** — INCORPORATED (§8.6, Decision 10, touch-point #11).
**Critical (timeline/sketch)** — INCORPORATED (§8.8, touch-point #9). Verified the `selectedOutputNodeId`/`jobOutputs`/`extractAssetId`/fail-job pattern.
**High (browser worker)** — INCORPORATED (folded into §8.5).
**High (mini-apps)** — INCORPORATED (§8.9, touch-point #10). Verified result tiles built entirely from `output_update`.
**High (browser autosave)** — INCORPORATED (Decision 9, §15).
**Medium (CLI)** — INCORPORATED (§8.11, Decision 12, touch-point #12).
**Medium (chat generation)** — INCORPORATED (§8.10, Decision 11).
**Medium (constant/input leak)** — INCORPORATED (Decision 7). Verified the `skipResult` set (`actor.ts:437-439`) and reconciled the `result`-read rules.
**Medium (setOutputResult call sites)** — INCORPORATED (§8.7, Decision 4). Verified 4 runtime call sites + 1 doc comment.

No findings were dropped as wrong; the two that were *partially* wrong (the double-save rationale and the `_messages`-authoritative claim) are corrected in-body rather than silently removed.
