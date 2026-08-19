# Canonical Model Intelligence — Design

Status: proposed. Nothing in this document is built yet.

## The problem

NodeTool lists `fal-ai/kling-video/v3/pro` (FAL) and `kling/v3-pro` (kie) as
two unrelated models. They are two routes to one model. The picker shows the
same model many times, nothing orders a list of 80 video models by quality,
and `find_model` ranks candidates only by the static `RECOMMENDED_MODELS`
list, provider hints, and locality.

An earlier draft of this design proposed a new `packages/model-catalog`
package with a hand-written `CanonicalModel` registry, a hand-written
`MODEL_ALIASES` table, a `ModelMetadata.ranking` field on the wire model
types, and per-route latency/reliability scores. This document keeps that
draft's one load-bearing idea — **canonical model ≠ provider route** — and
discards most of its machinery, because the repo already ships the hard half.

## What already exists

The GenSpend pricing sync (`scripts/sync-genspend-pricing.mjs`,
`scripts/genspend/`) already solves canonicalization for the media models,
and its output already ships in every release:

- `packages/model-pricing/src/generated/genspend-pricing.json` is keyed
  `<provider_id>:<model_id>` and **every entry carries `model_slug` — a
  canonical model id**. Today that is 276 priced provider-native ids
  resolving to 104 canonical slugs, 51 of which span more than one provider
  (`seedance-2` → atlascloud + kie, `seedream-5-pro` → atlascloud + kie, …).
- `scripts/genspend/normalize.mjs` is the naming bridge: one comparison key
  per model (`FLUX.2 [pro]` ≡ `flux-2-pro`), vendor-prefix stripping, task
  suffix stripping, and the guards that keep it honest (a family name that
  matches too many ids is dropped as ambiguous, a capability flag that
  refutes a task blocks the match).
- `scripts/genspend/match.mjs` resolves an upstream model to NodeTool ids
  through a five-tier trust ladder (`alias` > `variant` > `provider-id` >
  `receipt` > `catalog`), and `scripts/genspend/aliases.json` is the
  hand-pin escape hatch: pin a match the comparison cannot see, or block a
  wrong one, without weakening the rules for everything else.
- The nightly `GenSpend Pricing Sync` workflow regenerates the artifact and
  opens a PR — numbers that gate spend get reviewed, not auto-merged.
- `getGenspendPrice(provider, modelId)` is how the web UI and the runner
  read route facts (price) today: a synchronous lookup on a shipped
  snapshot, no network, no key.

So "introduce canonical model ≠ provider route" is not a new abstraction to
build. It is a field to promote. The design below is: **make `model_slug`
first-class, and ship quality rankings as a second generated artifact in the
same shape, through the same pipeline pattern, read through the same kind of
lookup.**

## Design

### 1. The canonical id is GenSpend's `model_slug`

No new `CanonicalModel` registry, no new `MODEL_ALIASES` table in runtime
code. The slug vocabulary, the slug→provider-id resolution, its trust
ladder, and its hand-pin file already exist and are already reviewed
nightly. A second canonicalization mechanism would drift from the first;
the pricing sync's is the one that gets exercised and corrected because
wrong prices get noticed.

Two consequences, both acceptable:

- A model GenSpend does not track has no canonical id. It stays exactly
  what it is today: listed, runnable, unranked, ungrouped. Canonical
  grouping is an enhancement, and "unmapped" is the designed fallback —
  an incorrect merge is worse than an unmapped model.
- The vocabulary is a third party's. A renamed slug shows up as a diff in
  the nightly sync PR, where a maintainer sees it. Shipped artifacts freeze
  the slugs they were generated with, so a rename can never break an
  installed app.

Scope: media models (image, video, TTS, music) — the modalities where routes
multiply and where FAL/kie/atlascloud/replicate overlap. Language models are
out of scope for v1: their ids are already near-canonical per provider, and
`find_model` already handles them adequately.

### 2. Rankings are a second generated artifact in `packages/model-pricing`

```
scripts/sync-model-rankings.mjs          # new, sibling of sync-genspend-pricing.mjs
scripts/rankings/aliases.json            # hand-pins: AA/Arena name → canonical slug, or null to block
        ↓  (Artificial Analysis data API; Arena leaderboard dataset later)
packages/model-pricing/src/generated/model-rankings.json
packages/model-pricing/src/model-rankings.ts   # typed accessor module
```

Not a new `packages/model-catalog` package. `model-pricing` is already the
package whose job is "externally sourced model facts, shipped as a generated
snapshot, read by web and runner" — rankings are the second column of the
same table. If the package outgrows its name, renaming it to
`@nodetool-ai/model-catalog` is a mechanical follow-up PR; creating a 57th
package for two JSON files is not the place to start.

The artifact mirrors the pricing catalog's shape — keyed by
`<provider_id>:<model_id>`, **expanded at sync time**, so runtime does zero
matching:

```jsonc
{
  "schemaVersion": 1,
  "source": "artificialanalysis.ai",
  "generatedAt": "2026-08-19T...",
  "models": {
    "fal_ai:fal-ai/kling-video/v3/pro": {
      "canonical": "kling-3-pro",
      "name": "Kling 3 Pro",
      "creator": "Kuaishou",
      "tasks": {
        "text_to_video":  { "score": 1123, "normalized": 0.94, "rank": 2, "of": 41 },
        "image_to_video": { "score": 1101, "normalized": 0.91, "rank": 3, "of": 38 }
      }
    },
    "kie:kling/v3-pro": { "canonical": "kling-3-pro", ... }
  }
}
```

- `canonical` groups routes; every route to one model carries identical
  `tasks` — quality is a property of the model, never of the route.
- `tasks` keys are NodeTool's own `supportedTasks` vocabulary
  (`text_to_image`, `image_to_video`, …), which is what the AA media API's
  per-task leaderboards map onto. **No single overall score per model** — a
  model mediocre at text-to-image can lead at editing.
- `score` is the source-native number (arena-style rating), `normalized`
  its 0–1 position within that task's leaderboard, `rank`/`of` for display.
  No invented `confidence`, no stored badges — "best quality" / "best value"
  are derived at render time from rank + price, not persisted.

How the sync matches AA/Arena names to canonical slugs: the GenSpend catalog
snapshot the pricing sync already downloads carries each model's `slug`,
`name`, `shortName`, and `aliases[]`. The rankings sync indexes those with
the existing `modelKeys()` from `scripts/genspend/normalize.mjs` and looks
each AA model up by the same exact-key comparison — no fuzzy matching, no
prefix matching. Anything unmatched is **reported, never guessed**, and
`scripts/rankings/aliases.json` pins or blocks the stragglers by hand,
exactly as `scripts/genspend/aliases.json` does for prices. Expansion from
slug to `provider:model_id` keys reuses the resolution the pricing artifact
already records — a slug's routes are simply the pricing entries that carry
it, plus alias pins.

Operationally it copies the pricing sync verbatim: nightly workflow, opens a
PR only when something moved, `sync:model-rankings:check` fails CI when the
artifact and a fresh measurement disagree, no API key in the shipped app, no
network call at startup. NodeTool is local-first; a ranking that evaporates
when a leaderboard site is down is worse than a week-stale snapshot.

### 3. Reading it: a lookup, not a field on the wire types

The earlier draft added `metadata?: { ranking?: … }` to `ImageModel` /
`VideoModel` and enriched inside `loadImageModels()`. Rejected:

- Those are runtime routing objects that cross the wire in every model-list
  response, from ~30 providers. Enriching in the loaders touches every
  provider path to serve a concern only three consumers have, and couples
  `packages/runtime` to ranking data it never uses to execute anything.
- The repo already has the right pattern in production: prices never sat on
  the model objects either. `web/src/utils/modelUnitPricing.ts` and the
  runner both call `getGenspendPrice(provider, id)` where they need it.

So the accessor module is the whole runtime API:

```ts
// packages/model-pricing/src/model-rankings.ts
getModelRank(provider, modelId): ModelRank | null       // one route's entry
getCanonicalId(provider, modelId): string | null        // grouping key
routesFor(canonicalId): RouteEntry[]                    // all provider routes to one model
rankedForTask(task): RankedCanonicalModel[]             // leaderboard, canonical models
```

`ImageModel`, `VideoModel`, and friends do not change. Nothing in
`packages/runtime`'s provider layer changes.

### 4. Consumers

**`find_model` / `nodetool.models.pick`** (`packages/agents/src/capabilities/models.ts`).
Today's score is additive: recommended +100, provider hint +200, model hint
+250, local +150. Add one bounded term — `normalized × 80` for the requested
task — below the explicit-preference bonuses, so a user hint still outranks
a leaderboard, and attach `rank`/`of`/`canonical` to the returned
candidates. Two routes to one canonical model collapse to the better-priced
one in the top results, with the alternates listed under it. The agent
answer the draft asked for ("Kling 3 Pro, FAL, rank 2 of 41, $0.18/s — also
via kie at $0.14/s") falls out of `routesFor` + `getGenspendPrice`, both
already-shipped lookups. This is worth more than the picker UI: model choice
by agents is currently blind past the recommended set.

**`/api/models/recommended*`** (`packages/websocket/src/models-api.ts`).
The task-specific endpoints (`/recommended/video/text-to-video`, …) merge
ranked canonical models into what they return today.
`RECOMMENDED_MODELS` stays, demoted to what it really is: hand-pinned
overrides that always surface first (and the only mechanism for modalities
and providers the rankings cannot see — local Ollama models, ASR). It stops
being the sole ordering.

**Model picker (web, then mobile).** Group entries by `canonical`: one row
per model, routes as sub-entries with per-route price from the pricing
catalog. Sort ranked models by task rank above the unranked remainder
(alphabetical, as today) under an "All models" divider — the full list stays
complete; NodeTool's selling point of offering everything is untouched.
Badges (`Best quality`, `Best value`, `Fastest` where duration data exists)
are computed in the picker from rank + price. Web reads the accessor module
directly, as it reads prices today; mobile reads the enriched
`/api/models/recommended*` responses.

### 5. What is deliberately not built

- **No `ModelRoute` runtime object and no route scores.** The draft's
  per-route latency (42s vs 58s) and reliability (99.6% vs 98.9%) numbers
  have no data source — NodeTool has no fleet telemetry and should not
  invent numbers. Route facts NodeTool can actually stand behind are price
  (shipped) and, later, the user's own prediction ledger (`nodetool costs`)
  for observed local latency. When such a source exists, it becomes another
  lookup keyed `provider:model_id`; the shape is ready for it.
- **No weighted `recommendation = 0.65·quality + 0.20·value + …` formula.**
  A stored composite hides its inputs and invites tuning debates. Sort by
  task quality; show price beside it; let explicit user hints dominate in
  `find_model`. The one place that blends (the find_model score term) is a
  single bounded addend in existing code, not a scoring service.
- **No runtime fuzzy matching, ever.** All matching happens at sync time,
  is exact-key, and lands in a reviewed PR. Unmatched models are reported
  in the sync output and fixed in `aliases.json` by hand.
- **No automatic cross-provider failover.** Routing a run to a different
  provider than the one saved on the node is a spend decision the user did
  not make. `routesFor` makes an *offered* alternative possible (in the
  picker, in an agent's answer); nothing switches silently.

## Failure posture

Everything fails toward today's behavior. A missing or empty
`model-rankings.json` means: no grouping, no rank term in `find_model`, the
picker sorts as it does now. A model absent from the artifact is unranked,
never hidden and never down-ranked below where it sits today (the rank term
only adds). The sync fails closed: an AA response that does not parse, or a
leaderboard whose task cannot be mapped, drops that task from the artifact
and says so in the PR body, rather than shipping a number nobody can trace.

Per the repo's check discipline: the sync's parity check must be proven able
to fail (perturb one score, watch it go red) before it gates anything, and
the unmatched-models report must assert it *found* the fixtures it plants.

## Rollout

1. **Accessor + artifact plumbing** — `model-rankings.ts`, an empty-but-valid
   generated file, `rankedForTask`/`routesFor`/`getCanonicalId` with unit
   tests against a fixture artifact. No behavior change anywhere.
2. **Sync** — `sync-model-rankings.mjs` against the Artificial Analysis data
   API (its media leaderboards map cleanly onto `supportedTasks`), reusing
   `scripts/genspend/normalize.mjs`; nightly workflow + `:check`; first real
   artifact lands by PR. Arena's dataset joins later as a second signal —
   averaging sources is a sync-time concern and changes nothing downstream.
3. **Agent surface** — the `find_model` rank term and canonical/route fields
   in its answer; extend the `find_model` cases in the eval suites to pin
   that a ranked model outranks an unranked one and that hints still win.
4. **API + pickers** — enrich `/api/models/recommended*`; group and sort the
   web picker; mobile follows on the API alone.

Each pass ships alone and is useful alone; pass 1+2 already give agents and
the API the data even before any UI moves.
