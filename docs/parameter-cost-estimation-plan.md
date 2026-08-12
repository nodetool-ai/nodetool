# Parameter-based cost estimation from GenSpend data — implementation plan

*Plan, 2026-08-12. Targets the GenSpend v1 API (`https://genspend.io/api/v1/…`), which evolves
additively only.*

## 1. The problem

The cost estimate NodeTool shows (and gates budgets on) is `unit_price × quantity`, where
`quantity` is only fan-out (`num_images` etc.). The unit is carried but never applied:

- A model billed **per video second** is estimated at one second, whatever `duration` the node
  sets. 103 of the 283 GenSpend catalog entries are `per-video-second` — for those, a 10s clip is
  under-estimated 10×.
- Resolution ladders are collapsed at sync time to a single number
  (`scripts/sync-genspend-pricing.mjs:120-132`): same model twice → keep the cheaper, different
  models on one id → keep the dearer. A `seedance-2` node at 1080p and one at 480p estimate the
  same.
- Audio-state pricing (silent vs with-audio, up to 2× apart), reference-image surcharges, and
  reference-video re-rates are not represented at all.

GenSpend now publishes all of this — per-spec `variants[]`, `surcharges[]`, `capabilities`
(clip-length envelopes), and `dataFlags[]` — through `GET /api/v1/export` (~92 KB gzipped) and
prices it with `POST /api/v1/quote`. The plan: pull the parameterized data in the nightly sync,
compute locally from the shipped snapshot (NodeTool is local-first; the browser bundle and the
packaged Electron backend must both price without a network call), and verify our arithmetic
against `/quote` in the sync workflow, where the network already exists.

## 2. Current architecture (what changes, what stays)

```
scripts/sync-genspend-pricing.mjs             nightly pull → generated JSON   ← CHANGES
scripts/genspend/{match,normalize,inventory}  GenSpend↔NodeTool id matching   ← stays
packages/model-pricing/src/genspend-catalog.ts  typed catalog wrapper         ← CHANGES (schema v3)
packages/model-pricing/src/index.ts           getModelUnitPrice lookup        ← CHANGES (param-aware)
packages/node-sdk/src/cost-estimate.ts        estimateWorkflowCost            ← CHANGES (units × params)
packages/protocol/src/creative.ts             NodeCostEstimate types          ← CHANGES (additive)
web/src/hooks/useWorkflowCostEstimate.ts      editor hook                     ← CHANGES (+ bug fix)
web/src/components/costs/WorkflowCostEstimatePanel.tsx  the panel             ← CHANGES
packages/websocket/src/unified-websocket-runner.ts  estimateRunCost budget gate ← inherits for free
packages/websocket/src/sdk/sdk-static-preflight-service.ts  preflight         ← inherits for free
```

The matching pipeline (alias → variant → receipt → provider-id → catalog, in
`scripts/genspend/match.mjs`) is unchanged: it answers "which NodeTool `provider:model_id` keys
does this GenSpend offering price", and that question is the same whether the value stored is a
scalar or a grid. FAL and kie keep their own catalogs and keep winning the lookup order — this
plan parameterizes the GenSpend tier only (a later PR can apply the same unit arithmetic to the
FAL `per-video-second` entries, which have the same defect).

## 3. Phase 1 — pull job: ship the grid, not one rung

**Files:** `scripts/sync-genspend-pricing.mjs`, `packages/model-pricing/src/genspend-catalog.ts`,
`packages/model-pricing/tests/genspend-sync.test.ts`, `.github/workflows/genspend-pricing.yml`.

### 3.1 Switch the fetch to `/api/v1/export`

`/export` is the same projection as `/models` plus `surcharges`, open `dataFlags`, and the
embedded `usage` block, assembled server-side so the two cannot drift. Keep the ETag /
`If-None-Match` handling, the strong-ETag workaround, the retry loop, and the refuse-to-write-empty
guard exactly as they are; only the URL and the envelope shape change
(`export` has `{schemaVersion, generatedAt, counts, usage, models}`).

### 3.2 Schema v3: `GenspendPrice` grows a grid

Bump `SCHEMA_VERSION` to 3 (which also correctly invalidates the stored ETag on the first run).
Each entry keeps today's scalar fields — `unit_price` / `billing_unit` stay the **base-spec**
price, so every existing consumer keeps working unmodified through the migration — and adds:

```ts
interface GenspendVariant {
  price_usd: number;
  unit_class: string;          // may differ per row (e.g. per-generation duration rows)
  resolution?: string;         // "480p" | "720p" | "1080p" | "2K" | "4K" | image sizes
  duration_seconds?: number;
  with_audio?: boolean;
  video_input?: boolean;
  tier?: string;
  is_base: boolean;
}

interface GenspendSurcharge {
  kind: "input_image" | "input_video_second" | "per_request";
  spec?: string;               // resolution scope for input_video_second
  unit_price_usd: number;
  free_allowance: number;
  label?: string;              // per_request extras ("prompt expansion")
}

interface GenspendPrice {
  /* existing v2 fields unchanged: unit_price, billing_unit, unit_class,
     model_slug, match, live, source_url, tier?, resolution? */
  variants?: GenspendVariant[];      // the provider's published grid, typed facets only
  surcharges?: GenspendSurcharge[];
  clip_seconds?: { set?: number[]; min?: number; max?: number } | null;
  data_flags?: Array<{ kind: string; severity: "quote_wrong" | "spec_gap" | "cosmetic" }>;
}
```

Rules, following GenSpend's own `usage` guidance verbatim:

- **Store facets, drop raw `spec` strings.** The raw string is GenSpend's truth surface, but we
  only compute on the typed facets; a variant whose facets are all `null` beyond `is_base`
  contributes nothing and is dropped. This keeps the JSON small.
- **The base-scalar pick changes for the better.** Today the collapse picks a rung arbitrarily
  (cheapest/dearest by trust rule). With the grid shipped, `unit_price` becomes the **base-spec
  row** (`is_base: true`) when one exists, falling back to the current rule. The dearer-model
  budget-gate rule for two different models on one id stays.
- **`quote_wrong` flags gate at sync time and at display time.** The sync stores the flag; the
  calculator refuses to price a flagged entry (returns null → confidence "unknown"). Today that
  fires zero times; it keeps us honest when it doesn't.
- **`clipSeconds: null` means decline every duration** — store it as-is, never as permissive.
- **Cosmetic flags are dropped at sync time** (display-text only, and we render our own text).

### 3.3 Size and diff hygiene

The v2 JSON is ~2 600 lines. Variants exist mostly on video models (~100 keys), typically 4–8
rows each; surcharges on a handful. Expected growth: roughly 2–3×, still far below the 840 KB
full export because we ship only matched keys and typed facets. Measure after the first build and
record the number in the PR. Keep the `updatedAt`-carry-over so an unchanged nightly run still
produces no diff.

### 3.4 Workflow: add a parity gate

Extend `.github/workflows/genspend-pricing.yml` with a step after the sync, before the PR is
opened: `node scripts/genspend/parity-check.mjs` re-prices ~15 fixed cases (cheapest-provider
image, a resolution ladder, per-second × duration, with/without audio, additive reference images
with an allowance, a resolution-scoped video re-rate, a rung we must decline, per-request extras
excluded from the total) through **our** calculator against the freshly-built catalog and asserts
each equals `POST /api/v1/quote` for the same step. This mirrors GenSpend's own
`export-parity.ts`, which currently passes 17/17 — a drift in our port fails the nightly job
instead of shipping a wrong number. The script needs the network, so it runs in this workflow
only, never in the PR quality gate.

Prove the gate can fail once before merging: perturb one local price and watch the step go red.

## 4. Phase 2 — the shared calculator: params in, breakdown out

**Files:** `packages/model-pricing/src/index.ts` (+ new `genspend-calc.ts`),
`packages/node-sdk/src/cost-estimate.ts`, `packages/protocol/src/creative.ts`,
`packages/node-sdk/src/` (new `pricing-params.ts`), tests in both packages.

### 4.1 New lookup signature (additive)

```ts
export interface ModelPriceParams {
  resolution?: string;        // normalized: "480p".."4K", "512×512", …
  seconds?: number;           // output duration
  withAudio?: boolean;
  referenceImages?: number;
  megapixels?: number;
}

export interface ModelParamPrice extends ModelUnitPricingLike {
  breakdown?: string;         // "5 s × $0.205/s at 720p"
  assumptions?: string[];     // "resolution not set on node — priced at base spec 720p"
  warnings?: string[];        // "reference-image surcharge not captured — treat as at least"
  declined?: string;          // set instead of a price when we refuse to extrapolate
}

export function getModelUnitPrice(
  model: SelectedModel,
  params?: ModelPriceParams
): ModelUnitPricingLike | null;   // unchanged behavior when params omitted
```

`getModelUnitPrice` keeps its exact current behavior with no `params` — every existing call site
(runner budget gate, chat spend, preflight) compiles and behaves identically until Phase 3
threads params through.

### 4.2 Selection rules (a deliberate subset of GenSpend's calculator)

Implemented in `packages/model-pricing/src/genspend-calc.ts`, pure and I/O-free, mirroring the
rules GenSpend documents (and per their handoff, **never** "scan variants and take the cheapest"):

1. Narrow `variants` by every param we hold: `resolution` (normalized, `768p` → `720p` tier per
   their parser; we implement the same 5-tier video / 4-tier image mapping), `with_audio`
   (unset param → prefer the base spec, the honest default deliverable), `video_input === false`
   for plain t2v/i2v.
2. No row matches a **stated** resolution → **decline** (`declined: "no published price at
   1080p"`), never reuse another rung. Resolution **unset** on the node → base-spec row plus an
   `assumptions` entry.
3. `per-video-second` / `per-audio-second`: multiply by `seconds`; clamp check against
   `clip_seconds` — outside the envelope → decline. `seconds` unknown → price one second and
   record the assumption (confidence stays "estimate", the panel shows "per second").
4. `per-image` / `per-generation`: unit price as today; fan-out multiplication stays in
   `estimateWorkflowCost`.
5. Surcharges: `input_image` adds `max(0, refs − free_allowance) × rate`. `input_video_second`
   **replaces** generation cost with `rate × (input + output)` seconds, scoped by resolution —
   no scoped row for the requested resolution → decline the re-rate and warn (understating is
   the direction that hurts). `per_request` is surfaced in `warnings`/`assumptions`, never added
   silently. (Reference params are unlikely to be readable from nodes in v1 — the shapes ship in
   the calculator anyway so the parity gate exercises them and the UI can grow into them.)
6. `quote_wrong` data flag → decline. `spec_gap` → exact at base spec, adds a warning off it.

Deliberately out of scope for v1 (declined or base-priced with an assumption, matching what the
catalog can't express): token-billed image inputs, per-candidate agentic billing, quality axes.

### 4.3 Parameter extraction from node data

New `packages/node-sdk/src/pricing-params.ts`, the sibling of `FAN_OUT_PROPERTY_NAMES`
(`web/src/utils/aiModelNodes.ts` moves its list here or re-exports — one source of truth):

- **Duration:** first present of `duration`, `duration_seconds`, `seconds`, `num_seconds`,
  `video_length`, `video_duration` with a finite positive value; also `num_frames ÷ fps` when
  both exist. Values may be strings on some nodes (`"5"`, `"5s"`) — parse leniently, extract
  strictly.
- **Resolution:** first present of `resolution`, `image_size`, `size`, `quality`;
  `width` × `height` → nearest tier. Normalize to GenSpend's accepted sets; an unrecognized
  value maps to *unset* (assumption), never to a guessed tier.
- **Audio:** `generate_audio`, `with_audio`, `audio` boolean properties.

Before writing the list, enumerate the actual property names: grep the generator manifests
(`packages/fal-nodes`, `packages/replicate-nodes`, kie) and `packages/base-nodes` video/image
node definitions, and record the census in the PR — the list must come from what nodes ship,
not from memory.

`estimateWorkflowCost` gains an optional `getParams?: (node) => ModelPriceParams` input the
callers supply (keeps node-sdk hermetic), threads the result into `getModelPrice`, and:

- multiplies `seconds`-billed prices by extracted duration (the calculator returns the
  already-multiplied `unit_price` for per-second classes, so `estimated_cost` stays
  `unit_price × quantity` — fan-out still applies on top: 2 clips × 5 s each),
- copies `breakdown` / `assumptions` / `warnings` / `declined` onto the item,
- applies the existing `isVagueBillingUnit` guard to the `getModelPrice` path too (today it only
  guards FAL metadata — a `"units"`-billed GenSpend fallback is currently summed; that's a bug).

### 4.4 Protocol (additive)

`NodeCostEstimate` in `packages/protocol/src/creative.ts` gains optional
`breakdown?: string`, `assumptions?: string[]`, `warnings?: string[]`, and `estimated_cost` gains
a documented "lower bound when `warnings` is non-empty" semantic. `CostConfidence` stays as-is —
"estimate" covers parameterized figures; declined entries are "unknown" with the reason in
`assumptions`.

## 5. Phase 3 — wire the callers (and fix the data-shape bug)

**Files:** `web/src/hooks/useWorkflowCostEstimate.ts`, `web/src/utils/aiModelNodes.ts`,
`packages/websocket/src/unified-websocket-runner.ts`,
`packages/websocket/src/sdk/sdk-static-preflight-service.ts`, tests.

### 5.1 The bug: `node.data` vs `node.data.properties`

Editor nodes store property values under `data.properties` (`web/src/stores/NodeData.ts:25-27`),
but `useWorkflowCostEstimate.ts:58,65` passes `node.data` straight through — so `selectedModel`
and `nodeExpectedQuantity` read the top level and find nothing. In the live editor, generic
model-picker nodes almost certainly price as "unknown" and every quantity is 1; the hook's unit
test passes because its fixture is flat. Fix first, with a test whose fixture uses the **real**
nested shape (reproduce the failure before enforcing the fix — watch the current code go red
against the nested fixture). The server preflight already handles both shapes
(`sdk-static-preflight-service.ts:373-378`) and is the pattern to follow.

### 5.2 Thread params

- Web hook: build `getParams` from `extractPricingParams(node.data.properties)` and pass it to
  `estimateWorkflowCost`. The hook already subscribes to the `NodeStore` via
  `useSyncExternalStore`, so a `duration` edit re-prices on the next store tick — verify a
  property edit actually bumps the subscribed version, and re-render cost is bounded by the
  existing memoized estimate.
- Runner: `estimateRunCost` / `estimateNotetoolSpend` / preflight pass the same extractor over
  the graph's node data. The budget gate stays a **floor** by policy — declines contribute 0 to
  the reserved amount exactly as unknowns do today, and per-second pricing only raises the gate,
  never lowers it (base-spec fallback is by construction ≥ the old collapsed-cheaper number for
  same-model grids).

## 6. Phase 4 — the panel

**File:** `web/src/components/costs/WorkflowCostEstimatePanel.tsx` (+ its test).

- **Qty → Units.** The quantity column becomes a units cell rendered from the item:
  `2 × 5 s @ 720p`, `4 images`, `1 generation`. Fan-out and duration read as one phrase.
- **Breakdown is the trust surface.** A row with `breakdown` shows it in the row's tooltip/expand
  (the panel already has per-row tooltips for unknowns); `assumptions` render as a muted
  sub-line ("resolution not set — priced at 720p").
- **Lower bounds are labeled.** Any item with `warnings` (unpriced surcharge) renders its cost as
  `≥ $X` and the panel total as `≥ $Y` when any contributing item is a lower bound — "at least",
  never a false exact.
- **Declines are actionable unknowns.** A declined item keeps the warning icon but the tooltip
  says *why* ("no published price at 1080p for this provider — try 720p"), which is the reason
  GenSpend returns `null` instead of extrapolating.
- **Staleness stays visible.** The attribution line already renders `updatedAt`; keep it, and
  add `catalogGeneratedAt` to the tooltip.
- All rendering through `ui_primitives` and design tokens per repo rules; no raw MUI.

Out of scope here but noted for a follow-up: per-node price chips (`FalPricingFooter`,
`KieCreditsFooter`) could show the parameterized figure for GenSpend-priced nodes; today they are
FAL/kie-only.

## 7. Test plan

Per repo rules: every new check is proven able to fail once; the parity gate must also assert it
found and priced cases (an audit that matches nothing passes vacuously).

| Layer | Test |
|---|---|
| Sync | `genspend-sync.test.ts`: v3 entries carry variants/surcharges/flags from a fixture export; base-spec pick; `quote_wrong` gating; cosmetic flags dropped; empty-variants entries identical to v2 shape; unchanged-run produces no diff |
| Calculator | `packages/model-pricing/tests/`: ladder narrowing, decline on stated-but-missing rung, base-spec on unset resolution, seconds multiplication, clip envelope decline, audio axis, additive refs with allowance, re-rate replace + scoped decline, per_request excluded, `768p → 720p` tier parse, unrecognized resolution → assumption not guess |
| Parity | `scripts/genspend/parity-check.mjs` vs `/api/v1/quote`, nightly workflow only; seeded with GenSpend's documented figures (seedance-2 720p/5s = $0.56, minimax-h3 2K/6s + 8 refs = $1.02, kie re-rate 5s+5s = $1.25) |
| Estimator | `packages/node-sdk/tests/cost-estimate.test.ts`: params threading, vague-unit guard on the model path, breakdown/assumption propagation, fan-out × duration composition |
| Web hook | nested `data.properties` fixture (red on current code first), duration edit re-prices |
| Panel | units cell, `≥` rendering, decline tooltip, assumptions sub-line |
| Budget gate | `application-budget-gate.test.ts`: per-second model with duration raises the reserved amount; decline reserves 0 (floor semantics unchanged) |

Post-change: `npm run typecheck && npm run lint && npm run test`, plus every workspace
`nodetool affected` names.

## 8. Sequencing and risk

Four PRs, each shippable alone:

1. **Sync v3** (schema + `/export` + parity gate). No behavior change downstream — new fields are
   dead weight until Phase 2. Riskiest diff is the generated JSON; the nightly PR review
   checklist covers it.
2. **Calculator + estimator** (params accepted, unused by callers). Pure packages, dense tests.
3. **Callers + bug fix.** The `data.properties` fix alone changes live numbers (nodes that priced
   as "unknown" start pricing) — call that out in the PR since the budget gate tightens.
4. **Panel.**

Risks worth naming:

- **The catalog is a snapshot; GenSpend corrects continuously.** Mitigated exactly as they advise:
  nightly re-fetch with `If-None-Match`, `updatedAt` visible in the UI, parity gate on every sync.
- **Our port can drift from their calculator.** The parity gate is the control; if it becomes a
  maintenance burden, the fallback GenSpend offers is vendoring their `calc.ts` +
  `apply-surcharges.ts` — keep our calculator's interface narrow enough that swapping the
  implementation is contained to `genspend-calc.ts`.
- **Property-name census is heuristic.** A node whose duration property we don't recognize prices
  at one second with an assumption line — visible, not silent. The census list is data, easy to
  extend.
- **Tightened budget gate can refuse runs it used to admit.** That is the point, but it lands in
  PR 3 with its own callout; the gate's fail-open error handling is untouched.

## 9. Explicitly not in this plan

- Calling `POST /api/v1/quote` from the product at edit time (a keystroke stream describing what
  a user builds leaves the machine; GenSpend themselves recommend local compute for local-first
  products). A "why is this the price?" affordance that makes one deliberate `/quote` call for
  the breakdown string is a reasonable follow-up.
- Parameterizing the FAL/kie catalog tiers (same defect, different generators — follow-up).
- LLM token pricing (`per-1m-tokens` entries; prompt length is unknowable pre-run).
- Reading reference image/video counts from node inputs (shapes ship in the calculator; the
  extractor can learn them later).
