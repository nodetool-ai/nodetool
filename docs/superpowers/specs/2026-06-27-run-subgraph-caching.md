# Run-Subgraph Caching: Hashing, Freshness, TTL, and Subgraph Building

_Status: draft spec for review. Date: 2026-06-27._

How a partial run ("Run Node", "Run from here", "Run selected") assembles the
smallest correct subgraph: which upstreams are reused from cache, which are
recomputed, which block. It introduces a per-node **input signature** (hash) and
a per-type **cache TTL** so that:

- **Computed deterministic nodes are cached** (don't recompute unchanged work).
- **Time-sensitive nodes** (e.g. a web fetch) cache for a declared TTL, then refresh.
- **Generative nodes** (non-deterministic) reuse their **generation history**, not a hash.

It supersedes the Phase-0 heuristic already landed (reuse cache only for
`auto_save_asset` upstreams; `web/src/utils/runSubgraph.ts`).

---

## 1. Decisions to confirm

1. **Computed nodes are cached, gated by input-hash + per-type TTL.** A computed
   node is reused when an earlier result exists for the *same inputs* and is
   within its TTL; otherwise it re-runs. (Reverses the earlier "computed never
   cached" decision.)

2. **TTL is the purity statement.** A per-type `cacheTtl: number | "forever"`
   (seconds; `"forever"` is a string sentinel because `Infinity` is **not
   JSON-safe** — `JSON.stringify(Infinity) === "null"`, and metadata crosses the
   wire as JSON, see §4):
   - `"forever"` → pure deterministic; reuse while inputs match (math, Prompt, Template, format).
   - finite `n` → deterministic but time-sensitive; reuse for `n` s, then refresh (web fetch, API GET).
   - `0` / unset → never reuse; always re-run (Random, Now, side-effecting).
   This subsumes a `volatile` flag (volatile = `cacheTtl: 0`).

3. **`cacheTtl` default: `0` / opt-in (decided).** A node does not cache until it
   declares purity via `cacheTtl`. Safe by construction, matches "don't break
   anything": Phase 0 behavior (computed always re-runs) is preserved until a node
   opts in. Pure base nodes are promoted to `"forever"` incrementally as they're
   verified deterministic + side-effect-free; time-sensitive nodes get a finite
   value; nothing else changes. (Rejected: default `"forever"` / opt-out — every
   subtly-nondeterministic or side-effecting computed node would have to remember
   `cacheTtl: 0` or silently reuse wrong results across a large node surface.)

4. **Generative nodes use generation history; they do NOT block on staleness.**
   A generative reuses its current generation (`selected_generation` else latest
   completed); multi-select (≥2) → ForEach replay. It blocks **only** when no
   usable generation exists ("run X first"). The input hash is used only for an
   optional "inputs changed since this generation" **badge**, never to block.

5. **Explicit selection overrides everything.** A pinned generation or a
   multi-select set is honored as intentional, regardless of hash/TTL.

---

## 2. Node classification

| Kind | Test | Reuse policy |
|---|---|---|
| **Constant** | type `nodetool.constant.*` / `nodetool.input.*` | inline the **live** property value; prune |
| **Generative** | `metadata.auto_save_asset === true` | reuse current generation from **history** (no hash/TTL gate); multi-select → replay; block if none |
| **Computed** | everything else | reuse cached result iff **same input hash AND within `cacheTtl`**; else include & re-run |

- `nodetool.text.Prompt` is **Computed** with `cacheTtl: "forever"` (pure) → cached while its text/inputs are unchanged, re-run on edit.
- `Random`, `DateTime.Now` → **Computed**, `cacheTtl: 0`.
- A web-fetch / HTTP GET → **Computed**, `cacheTtl: 3600`.
- A Constant whose value is undefined falls through to Computed.

---

## 3. The hashing model

Two derived quantities per node, pure functions of `(nodes, edges, generations)`,
memoized over one topological pass, **never stored on `node.data`**.

### 3.1 `inputSignature(node)` — identifies a node's effective inputs (no time)

```
inputSignature(node) = H(
  node.type,
  normalizedConfig(node),                 // §3.3
  node.data.bypassed ?? false,            // coarse, defensive — see bypass note
  sorted( incomingEdges(node).map(e =>
            `${e.targetHandle}=${outputIdentity(e.source)}@${e.sourceHandle}`) )
)
```

**Bypass is resolved by the kernel rewrite, not re-implemented here.** A bypassed
node is not a simple "use my upstream" pass-through: the kernel's
`rewriteBypassedNodes` (`packages/kernel/src/graph-utils.ts`) routes around it
**per outgoing handle**, picking a type-compatible incoming edge (preferring a
handle-name match), dropping outgoing edges with no compatible input, dropping
`control` edges, and collapsing bypass chains. Hashing, resolution, and subgraph
building all operate on the graph **after** applying that same rewrite, so the
cache identity mirrors execution exactly (the rewritten edges produce the
signatures). The `bypassed` flag is still folded into the hash as a coarse,
defensive fallback: in the happy path the rewrite has already removed bypassed
nodes, but if one ever reaches the hasher un-rewritten the flag forces
re-computation rather than a silent stale hit.

### 3.2 `outputIdentity(node)` — how a node identifies what it emits to consumers

```
outputIdentity(node) =
  Constant   → H("const", node.type, normalizedConfig(node))   // value-derived
  Computed   → inputSignature(node)                            // output = f(inputs)
  Generative → node.data.selected_generations.length >= 2      // multi-select replay
                 ? H("multiselect", ...selected_generations)   //   ordered set it streams
                 : currentGeneration(node)?.id ?? "∅"          //   single opaque root
```

**Generative ⇒ generation id, not input hash.** A generative is
non-deterministic: same inputs, different outputs. A downstream node's cache was
built on *one specific* upstream generation; if the user navigates history or
re-runs the generative (new id), the downstream must invalidate. Keying on the
generation id captures that; keying on the input hash would not.

**Multi-select ⇒ the ordered selected set, not the current id.** When ≥2
generations are selected the node streams that ordered set (ForEach replay, §5),
so its output identity must be the set. Otherwise changing the selection from
`[a,b]` to `[a,c]` — which leaves `currentGeneration` and the node's own config
untouched — would NOT change a downstream computed node's signature, and the
downstream would reuse a stale cache built on the old stream. Order matters
(replay streams in pick order). `selected_generations` is excluded from
`normalizedConfig` (it isn't an *input* of this node) but belongs in
`outputIdentity` (it determines what this node *emits*).

_Note:_ time-sensitivity (TTL) is deliberately **not** in `inputSignature`. A
fetch within and beyond its TTL has the same signature. TTL expiry is handled in
the reuse resolver (§5) via "will re-run" propagation, not by the hash — so the
hash stays a stable content key.

### 3.3 `normalizedConfig(node)`

- `data.properties` + `data.dynamic_properties`, execution-affecting only.
- **Excludes** UI-only fields (position, size, `selected`, color, `title`,
  `collapsed`, `selected_generation`, `selected_generations`).
- **Excludes** backend output-mirror dynamic props (else a node self-invalidates
  after running).
- Asset-valued props hashed by **asset id / uri**, never bytes. Stable key order.

### 3.4 Stamping

Every produced generation is stamped, at **dispatch time**, against the **live
full graph** (not the pruned subgraph), with:

```ts
interface Generation { /* … */ inputSignature?: string; /* createdAt already exists */ }
```

- Computed: `inputSignature` is the cache key (reuse lookup, §5).
- Generative: `inputSignature` powers the optional staleness badge; reuse keys on
  the generation id (history).

Single write path: `handleUpdate` (workflowUpdates.ts) — both full and inline
runs flow through it. The dispatcher computes the signature map for the live
graph, stashes it by `jobId`; `handleUpdate` attaches it on upsert.

**Badge persistence (P2).** Live generations carry `inputSignature` in memory.
Persisted generations are reconstructed from `Asset` (`assetToGeneration`,
`nodeGenerations.ts`), which has no signature today. So the generative staleness
**badge is live-session-only** unless we also write `inputSignature` into
`asset.metadata` at autosave (`Asset.metadata` exists) and read it back in
`assetToGeneration`. v1: live-session-only (the badge is cosmetic; it simply
doesn't show on a freshly reloaded workflow until that node runs again).
Persisting it in asset metadata is a small, additive follow-up. Note this does
**not** affect generative *reuse* — reuse keys on the generation id, which
persists.

---

## 4. The `cacheTtl` field

Per node **type**, same `static field → metadata` pattern as `auto_save_asset`
(`node-metadata.ts`). Surfaced as `metadata.cache_ttl?: number | "forever"`
(seconds, or the string sentinel). **Not** `Infinity` — node metadata is
JSON-serialized over the API and `JSON.stringify(Infinity)` is `"null"`, which
would silently turn a "pure" node into a "never-cache" node after a round-trip.

```ts
static readonly cacheTtl = "forever";  // pure: math, Prompt, Template, string ops
static readonly cacheTtl = 3600;       // time-sensitive: web fetch
// (unset / 0)                          // never reuse: Random, Now, side effects
```

Only consulted for **Computed** nodes. Constants are always live; Generatives use
history.

---

## 5. Reuse resolution (bottom-up, with TTL + dirty propagation)

A simple top-down hash check is **not** enough: when a finite-TTL node expires
and re-runs, the *pure transforms downstream of it* must also re-run even though
their input hash is unchanged (the fetch produced new content). So resolve
bottom-up (sources → target), memoized, returning one of `REUSE(value) | RUN |
BLOCK`. `now` is injected (testability).

```
resolve(node, now):                    // memoized
  CONSTANT:   return REUSE(liveValue(node))            // never dirty

  GENERATIVE:                            // no hash/TTL gate; staleness is a badge, not a block
    // An explicit selection is intentional (§1.5): honor it or BLOCK, never
    // silently substitute a different generation.
    if ≥2 selected generations:                       // explicit multi-select
      return any(selected is completed) ? REPLAY(completed subset) : BLOCK(node)
    if selected_generation is set:                    // explicit single pin
      g = generation with that id
      return g?.status == "completed" ? REUSE(g) : BLOCK(node)
    // No explicit selection → latest completed; a failed/in-flight latest run
    // falls back to the last good result.
    return any(generation is completed) ? REUSE(latest completed) : BLOCK(node)

  COMPUTED:
    ups = upstreams(node).map(u => resolve(u, now))
    if any ups is BLOCK:            return BLOCK(propagate)
    anyUpstreamWillRun = any ups is RUN          // ← TTL-expiry / change propagation
    gen = latest completed generation with gen.inputSignature == inputSignature(node)
    ttl = cacheTtl(node)                          // number | "forever" | undefined
    cacheable = ttl == "forever" || (typeof ttl == "number" && ttl > 0)
    withinTtl = ttl == "forever" || now - gen.createdAt < ttl * 1000
    fresh = gen != null && cacheable && withinTtl
    if !anyUpstreamWillRun && fresh:  return REUSE(gen)
    else:                             return RUN(node)
```

Why `anyUpstreamWillRun` is necessary (and not redundant with the hash): a pure
transform `M ← N ← Fetch`. Fetch expires → `RUN`. `N`'s and `M`'s input
signatures are unchanged (the fetch's `outputIdentity` is its hash, unchanged),
so a hash-only check would wrongly reuse them and the fetch would never refresh.
`anyUpstreamWillRun` forces `N` and `M` to `RUN`. For *input edits* the signature
already changes, so this only adds the time dimension.

Generatives never produce `RUN` (they aren't re-run as a side effect) — only
`REUSE` or `BLOCK`. A `BLOCK` propagates to the target and aborts the run.

---

## 6. Subgraph building

The algorithm is defined over a **run region** — the set of nodes that will
execute — and its **external inbound edges** (edges whose target is in the region
and whose source is outside it). There are three partial-run call sites, with
three settled policies. Two are **full-resolve**: they share `createRunResolver`
(one resolver over the live full graph) and route every external inbound edge
through `resolve` (§5), so they classify, cache, and block identically. The
third — **live preview** — is deliberately best-effort and bypasses `resolve`.

**Run Node / Run from here** (`useRunSingleNode` / `useRunFromHere` →
`buildRunSubgraph`). Full resolve. Region = `{target}`, grown by `RUN` results;
internal edges run as-is. For each external inbound edge `source →
consumer.targetHandle` call `resolve(source, now)` and apply the outcome below. A
`RUN` upstream is **pulled into** the region and its own inbound edges recursed,
so the deterministic cone needed to feed the target re-executes. Inline a
constant's live value, a generative's current generation (history), or a
computed's fresh signature-matching cache; replay a multi-select generative;
BLOCK an uncached/stale generative ("run X first").

**Run selected** (`useRunSelectedNodes` → shared `createRunResolver`). Full
resolve, same classification and freshness as Run Node. Region = the selected
node set; internal edges among the selection run as-is. The one difference: it
runs **exactly** the selected set and does NOT recurse into or include external
upstreams. So a non-reusable external input — a computed that resolves to `RUN`
(cache-miss / stale), a constant with no live value, or a `BLOCK` generative —
**blocks the run** ("run X first") instead of pulling the upstream in. Only reuse
and replay seed the selection's inputs.

**Live preview** (`buildDownstreamRunGraph` — slider scrubs via
`useLiveSliderWriter`, input auto-run via `useInputNodeAutoRun`). Region = the
downstream cone from the root (callers restrict it to the browser-runnable
prefix). This path is **deliberately best-effort** and is NOT routed through
`resolve` or held to the §7 freshness/block matrix (S1–S38): a scrub must stay
live and cheap. It **never blocks** and **never re-runs or recurses external
upstreams**. Only constants resolve to their live value; computed and generative
externals keep their **cache-first last value** (the current selected
generation's output), so an expensive upstream is reused mid-scrub instead of
recomputed. Multi-select externals still inject a ForEach replay; a missing
cached value is simply skipped (no override, no block). This intentionally
settles the earlier "the three call sites resolve inputs inconsistently" finding:
the inconsistency between the two full-resolve paths is gone (both share
`resolve`); the preview path's divergence is **by design**, for preview liveness.

Per external edge (full-resolve paths — Run Node / Run selected):

```
REUSE(value)  → add override current.targetHandle = value (or replay edge); prune source
RUN           → Run Node: include source in submitted subgraph + recurse its inbound edges.
                Run selected: record blocked{ source } (never pulls externals in).
BLOCK         → record blocked{ source } (dedup by id)

after walk:
  - list-typed target handles aggregate multiple inbound overrides into a list
    (edgeOverrides), not last-write-wins
  - submitted = included sources + target, overrides applied
  - submitted edges = original edges with both endpoints included + replay edges
  - blocked non-empty → caller shows "run X first", does NOT dispatch
```

Invariants (full-resolve paths): pruned source contributes a value but isn't
submitted; blocked source aborts; target always submitted; hashing is lazy +
memoized; UI-only edits never recompute signatures. The live-preview path has no
blocked set and runs no signature/TTL pass — it injects cache-first values and
never aborts (see above).

---

## 7. Test cases (write before implementing)

`now` is injected so TTL is deterministic. `REUSE/RUN/BLOCK` refer to §5.

### 7.1 Hashing — `inputSignature` / `outputIdentity`

H1. UI-only change (move/resize/select/recolor/retitle) → signature unchanged.
H2. Static property change → signature changes.
H3. Dynamic property change → signature changes.
H4. `bypassed` toggle → signature changes.
H5. Inbound edges reordered in array → signature identical (order-independent).
H6. Add/remove an inbound edge → signature changes.
H7. Change an edge's source handle → signature changes.
H8. Constant `outputIdentity` is value-derived; editing the value changes it.
H9. Computed `outputIdentity` equals its `inputSignature`.
H10. Generative `outputIdentity` equals its current generation id; "∅" when none.
H11. Generative re-run (new id, identical inputs) → `outputIdentity` changes.
H12. Asset prop: same id, different in-memory bitmap → signature unchanged.
H13. Backend output-mirror dynamic prop change → signature unchanged.
H14. Editing a leaf changes its own + descendant signatures, not ancestors'/siblings'.
H15. TTL is NOT in the signature: a fetch's signature is identical before and after expiry.

### 7.2 Reuse resolution — Computed cache + TTL (`resolve`)

R1. Pure computed (`cacheTtl=∞`), cached gen with matching signature → REUSE.
R2. Pure computed, no cached gen → RUN.
R3. Pure computed, cached gen with DIFFERENT signature (input changed) → RUN.
R4. `cacheTtl=0` computed, even with a matching fresh gen → RUN (never reuse).
R5. unset `cacheTtl` (default per §1.3) → matches the chosen default's behavior.
R6. finite TTL, matching gen, `age < ttl` → REUSE.
R7. finite TTL, matching gen, `age ≥ ttl` → RUN (expired).
R8. finite TTL, `age` exactly at boundary → defined (`<` strict → RUN at ==).
R9. Pure computed M ← finite-TTL F, F within TTL → both REUSE.
R10. Pure computed M ← finite-TTL F, F expired → F RUN **and** M RUN (anyUpstreamWillRun).
R11. Deep pure chain M ← N ← F(expired) → F, N, M all RUN.
R12. Computed with a BLOCK upstream → BLOCK (propagates).
R13. Computed fed by a fresh Generative → REUSE (its own cache valid, generative reused).
R14. Computed fed by a Generative the user re-pointed (new gen id) → signature changed → RUN.

### 7.3 Subgraph — Constant

S1. Constant upstream → live value inlined, pruned.
S2. Constant with a stale cached generation → live value inlined (not the cache).
S3. `nodetool.input.*` treated as Constant.
S4. Constant feeding two handles → inlined to both.
S5. Constant with undefined value → falls through to Computed (included & run).

### 7.4 Subgraph — Computed

S6. Pure computed, cache hit → inlined, pruned (NOT submitted).
S7. Pure computed, cache miss (input changed) → included & re-run.
S8. `nodetool.text.Prompt` edited (cache miss) → included & re-run with current text; no stale value on target.
S9. `nodetool.text.Prompt` unchanged (cache hit) → output inlined, pruned.
S10. Computed → Computed chain, all cache-hit → all pruned, only target submitted.
S11. Computed → Computed chain, leaf changed → leaf + descendants submitted; unaffected branch stays pruned.
S12. finite-TTL fetch expired, feeding the target → fetch included & re-run.
S13. finite-TTL fetch within TTL → fetch output inlined, pruned.
S14. `cacheTtl=0` node (Random) → always included & re-run, never inlined.

### 7.5 Subgraph — Generative (history-based)

S15. Generative with a completed current generation → output inlined, pruned (NO hash check).
S16. Generative with NO completed generation → BLOCK.
S17. Generative with an in-flight (running) generation → BLOCK.
S18. Generative with an errored/in-flight LATEST and NO explicit pin → falls back to the latest completed (REUSE) if any, else BLOCK.
S19. Generative whose inputs changed since its generation → STILL inlined (no block); badge flagged separately.
S20. Generative explicitly pinned (`selected_generation`) to a completed gen → that generation inlined.
S20b. Generative explicitly pinned to a NOT-completed or missing gen → BLOCK (no silent fallback; §1.5). (Codex review #1.)
S21. Generative G1 → G2 → target, both have generations → both reused (history), only target submitted.

### 7.6 Subgraph — multi-select replay (explicit)

S22. Generative with ≥2 selected generations (≥1 completed) → one ForEach replay of the completed subset; source pruned; no hash/TTL.
S22b. Generative with ≥2 selected but NONE completed → BLOCK (no empty replay; §1.5). (Codex review #1.)
S23. Multi-select into a scalar handle → replay (no list gate).
S24. Multi-select into a list handle → replay.
S25. Multi-select with <2 selected → single-generation path.
S26. Empty selected set → single-generation path.
S27. Multi-select source feeding the same target handle twice → exactly one replay node (dedup).
S27b. A computed node consuming a multi-select stream: changing `selected_generations` `[a,b]`→`[a,c]` changes the upstream's `outputIdentity` ⇒ the computed node's signature changes ⇒ RUN (no stale reuse). (Covers P1.1; hashing side is H11b.)

### 7.7 Subgraph — aggregation, dedup, sharing, edges

S28. Two generatives (both have gens) into one list handle → outputs aggregated into a list.
S29. Two generatives into one list handle, one without a gen → BLOCK (the empty one).
S30. One generative feeding two handles → inlined to both; single source pruned.
S31. One generative with no gen feeding two handles → blocked once (dedup blocked list).
S32. Constant + Computed into different handles → constant inlined, computed per its cache state.
S33. Diamond target ← A(computed) ← C(constant), target ← B(computed) ← C → C inlined into A and B.
S34. Dangling edge (source not in nodes) with a cache → reuse, then skip (preserve current behavior).
S35. Dangling edge, no cache → dropped.
S36. Bypassed upstream → the graph is bypass-rewritten first (kernel `rewriteBypassedNodes`); hashing + subgraph see the rewritten graph. Sub-cases: single in/out pass-through; multi-output node routes each handle to a type-compatible input; an outgoing handle with no compatible input is dropped; a control edge to the bypassed node is dropped; a bypass chain A→B(bypassed)→C(bypassed)→D collapses to A→D.
S37. Cycle (ForEach/Loop region) → treated as a unit; no infinite recursion.
S38. Target is Generative and is run → its generation is stamped with the full-graph signature.

---

## 8. Storage, eviction, caveats

- **Computed cache lives in `liveGenerations`** (every node already synthesizes a
  generation from `node_update.result`), now stamped with `inputSignature`. Reuse
  = newest completed gen whose signature matches. **In-memory only** (cheap to
  recompute; not persisted across reload). Bound it: keep the newest generation
  per `inputSignature`, cap K signatures per node (LRU) so a node run with many
  different inputs can't grow unbounded.
- **Generative cache** is the durable generation history (persisted assets +
  live), unchanged.
- **Clock injection.** `resolve` takes `now`; tests pass a fixed value. App code
  uses `Date.now()` (allowed outside Workflow scripts).
- **Bypass** — apply the kernel's `rewriteBypassedNodes` (graph-utils) to the
  live graph **before** hashing/resolution/subgraph building, so cache identity
  mirrors execution (per-handle type-compatible rewiring, dropped control edges,
  collapsed chains). The `bypassed` flag in `inputSignature` is a coarse
  defensive fallback only (see §3.1).
- **Cycles / Loop / ForEach** — hash + reuse the SCC as a unit keyed on external
  inputs; DFS must not recurse a back-edge.
- **Streaming.** Reuse unit is the run group; a reused streaming/multi-variant
  upstream is replayed via the real `ForEach` (lineage/EOS-correct), never inlined
  as a flat list. Streaming generative `outputIdentity` = run-group cover id.
- **External-world drift beyond TTL semantics is not otherwise detected** — that's
  what TTL is for. `cacheTtl: 0` is the escape hatch for "never trust a cache."

---

## 9. Phasing

- **Phase 0 (landed):** reuse cache only for `auto_save_asset`; else live/re-run.
  Equivalent to §5 with Computed `cacheTtl` ≡ 0 and Generative reuse ungated.
- **Phase 1:** add `inputSignature` + stamping + Computed cache with `cacheTtl`
  (§4–§6); annotate pure base nodes (`"forever"`) and the nondeterministic set
  (`0` / finite). Route the **two full-resolve** call sites through `resolve` —
  `buildRunSubgraph` (Run Node / Run from here) and `useRunSelectedNodes` (Run
  selected) — so they classify/cache/block consistently; Run selected blocks on a
  non-reusable external instead of recursing it. The **live-preview** path
  (`buildDownstreamRunGraph`: slider scrubs, input auto-run) stays deliberately
  best-effort and is left out of `resolve` by design — cache-first last value,
  never blocks (§6). Generatives keep history reuse; add the live-session
  staleness badge.
- **Phase 2:** incremental full runs (send only the dirty cone via `resolve`);
  optional server-side memoization keyed by `inputSignature` (+ TTL), reusing the
  dormant `ProcessingContext.cache`.

Phase 1 is additive over Phase 0: same classification and branches; the Computed
branch gains the hash+TTL `resolve`, and the dispatcher gains signature stamping.
