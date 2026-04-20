# Model3D Providers — Wire Up Meshy & Rodin

A focused plan to **make `TextTo3DNode` and `ImageTo3DNode` actually work** by
adding 3D-generation capabilities to the TypeScript provider runtime and porting
the historical Python `MeshyProvider` / `RodinProvider` implementations.

This plan resolves **Bug 1b** in `PLAN-Model3DNodesRefactor.md` by replacing the
current `throw new Error("Not implemented")` stubs with real provider calls.

---

## Why this exists

- `packages/base-nodes/src/nodes/model3d/generation.ts` ships `TextTo3DNode` and
  `ImageTo3DNode` with full prop declarations but a `process()` that throws
  `NotImplemented`.
- A complete Python implementation (Meshy + Rodin) lived in `nodetool-core`
  at commit `25e60910` and was removed by the `a042e03f` strip-to-TS commit.
  We have ~840 LOC of working reference code in git history.
- The TS runtime already has the right scaffolding (`BaseProvider` pattern,
  `KieProvider` as an HTTP+poll reference, settings registry entries for
  `MESHY_API_KEY` / `RODIN_API_KEY`, UI display metadata) — only the actual
  provider implementations and a couple of `BaseProvider` extensions are
  missing.

---

## Already in place — do not duplicate

| Layer | Where |
|---|---|
| `MESHY_API_KEY` + `RODIN_API_KEY` registered as secrets | `packages/websocket/src/settings-registry.ts:345-346` |
| "Meshy AI" / "Rodin AI" display names + URLs | `web/src/utils/providerDisplay.ts:108-166` |
| `Model3D`, `TextTo3DParams`, `ImageTo3DParams` interfaces | `packages/runtime/src/providers/types.ts:187-208` |
| `TextTo3DNode` / `ImageTo3DNode` with full `@prop` declarations | `packages/base-nodes/src/nodes/model3d/generation.ts` |
| Default model values pointing at Meshy | `packages/base-nodes/src/nodes/model3d/defaults.ts:28-46` |
| Async submit + poll + download reference impl | `packages/runtime/src/providers/kie-provider.ts` |
| Working Python implementations (deleted) | nodetool-core git history at `25e60910:src/nodetool/providers/{meshy,rodin}_provider.py` |

---

## Naming decision

- Keep the type name **`Model3D`** in `packages/runtime/src/providers/types.ts`.
- Add a JSDoc comment that disambiguates "AI generation model" from "3D
  asset/file" (which is `Model3DRef`).
- Rationale: matches the existing `<MediaType>Model` pattern (`ImageModel`,
  `VideoModel`, `TTSModel`, `ASRModel`, `EmbeddingModel`). Renaming to
  `Model3DProvider` would conflict with the actual provider class
  (`MeshyProvider`, `RodinProvider`) which is a different abstraction layer.
- Add the missing `outputFormats?: string[]` field to `Model3D` so the shape
  matches what the node `defaults.ts` already implies.

---

## Quick-win priority

- [x] **#1 – Extend `BaseProvider` with 3D capabilities** *(landed `703d2f2cf`)*
  - `"text_to_3d"` and `"image_to_3d"` added to the `ProviderCapability` union.
  - Capability detection in `providerCapabilities()` keys off
    `getAvailable3DModels` (presence of 3D models implies both task types;
    individual `textTo3D` / `imageTo3D` calls throw if not implemented).
  - `getAvailable3DModels(): Promise<Model3D[]>` returns `[]` by default.
  - `textTo3D()` and `imageTo3D()` default to
    `throw new Error("<provider> does not support …")`.
  - `Model3D` interface gained JSDoc + `outputFormats?: string[]` field.
  - Verified: `npx tsc --noEmit -p packages/runtime/tsconfig.json` clean.

- [x] **#2 – Port `MeshyProvider`** *(landed in working tree)*
  - `packages/runtime/src/providers/meshy-provider.ts` — direct port of
    `nodetool-core@25e60910:src/nodetool/providers/meshy_provider.py`.
  - `fetch` (Node 18+) instead of `aiohttp`; `setTimeout` Promise instead of
    `asyncio.sleep`; `Buffer.from(bytes).toString("base64")` instead of
    `base64.b64encode`.
  - Polling state machine handles `SUCCEEDED` / `FAILED` / `EXPIRED` 1:1.
  - Methods: `getAvailable3DModels()`, `textTo3D()`, `imageTo3D()`,
    `requiredSecrets()`.
  - All four models exported as `MESHY_3D_MODELS` constant.
  - Polling cadence injectable via `MeshyProviderOptions` for tests.
  - `timeoutSeconds` added to `TextTo3DParams` / `ImageTo3DParams` so node
    timeout can be passed through (PR-4 will wire it).

- [x] **#3 – Port `RodinProvider`** *(landed in working tree)*
  - `packages/runtime/src/providers/rodin-provider.ts` — port of
    `nodetool-core@25e60910:src/nodetool/providers/rodin_provider.py` with
    one bug fix: the original Python `image_to_3d` accidentally submitted
    the task **twice** to fetch `subscription_key`; the TS version reads
    both `uuids[0]` and `subscription_key` from a single submit response.
  - All three models exported as `RODIN_3D_MODELS` constant.
  - Status polling handles `DONE` / `FAILED` / `ERROR` / `CANCELLED`, plus
    the "no jobs yet" transient where Rodin returns `jobs: []` for the
    first few polls.
  - Download is the documented two-step (POST `/v2/download` to get URL,
    GET that URL); falls back from `model_url` → `url` to match Python.

- [x] **#4 – Register the new providers**
  - Meshy registered + exported in `packages/runtime/src/providers/index.ts`.
  - Rodin registered + exported in `packages/runtime/src/providers/index.ts`.
  - Barrel also exposes `Model3D`, `TextTo3DParams`, `ImageTo3DParams`.

- [ ] **#5 – Wire `TextTo3DNode.process()` and `ImageTo3DNode.process()`**
  In `packages/base-nodes/src/nodes/model3d/generation.ts`, replace the
  `throw new Error("Not implemented")` blocks with:
  - Resolve the configured provider via `getRegisteredProvider(this.model.provider)`.
  - Build `TextTo3DParams` / `ImageTo3DParams` from the node fields.
  - For `ImageTo3DNode`, decode `this.image` to bytes via the existing
    image-resolution helper (whatever `imageToImage`-style nodes use).
  - Call `await provider.textTo3D(params)` / `provider.imageTo3D(bytes, params)`.
  - Wrap the returned bytes with `glbOutput(bytes)` from `model3d/base.ts`.
  - Honour `this.timeout_seconds` by passing it through.
  - Honour `this.seed === -1` → omit the `seed` field (random).

---

## Tests

- [ ] **#6 – Mocked HTTP tests for both providers**
  - [x] **Meshy** — `packages/runtime/tests/providers/meshy-provider.test.ts`
    (21 cases, all pass).
  - [x] **Rodin** — `packages/runtime/tests/providers/rodin-provider.test.ts`
    (25 cases covering: requiredSecrets, model catalogue with/without key,
    chat-throws, missing-key/empty-prompt/empty-image guards, full
    happy-path text-to-3D submit→poll→download→download-URL fetch, JPEG/PNG
    mime detection for imageTo3D, optional prompt forwarding for image
    mode, seed=-1 omission, missing-uuid/missing-subscription_key submit
    errors, FAILED + CANCELLED status mapping, non-200 submit error,
    polling timeout, transient-empty-jobs handling, `model_url`→`url`
    fallback, and missing download URL. **All 25 pass.**)

- [ ] **#7 – Smoke test for the wired-up nodes**
  In `packages/base-nodes/tests/`, add a test that instantiates `TextTo3DNode`
  and `ImageTo3DNode` with a mock provider and asserts the output shape is
  `{ output: Model3DRef }` with `format: "glb"`. This is the regression test
  for Bug 1b — it must catch any future stub regression.

---

## Cost tracking

- [ ] **#8 – Add Meshy / Rodin pricing entries** *(deferred — see note)*
  In `packages/runtime/src/providers/cost-calculator.ts`, add per-task pricing
  for the four Meshy models and the Rodin models. Source from each provider's
  pricing page; cite the URL in a comment so future bumps are easy.
  - Meshy pricing: <https://www.meshy.ai/pricing> (per-task credits).
  - Rodin pricing: <https://hyperhuman.deemos.com/api/pricing>.
  - These are not language-model-style token costs; treat them as flat
    per-call costs keyed by model id.
  - **Note:** the existing `CostCalculator` `PricingTier` schema only models
    token / character / minute / image / video costs. Adding flat per-task
    pricing requires either a new `CostType.TASK_BASED` tier or a parallel
    lookup table. Pull this into its own follow-up so the providers can ship
    without blocking on a schema bump.

---

## Out of scope for this plan

- Adding a third provider (e.g. Stability AI 3D, Tripo API). Defer until
  Meshy + Rodin are landed and the abstraction has proven itself.
- Adding non-bytes outputs (multi-file Rodin packages with separate textures).
  Rodin v2 returns a zip with the GLB plus PBR textures; for now we extract
  only the GLB and discard the rest. Track separately if users need it.
- Streaming progress events from the polling loop into the workflow
  runner. Today these calls are blocking; they can stay blocking until a
  user actually complains. The polling logs already give visibility in dev.
- HuggingFace local 3D nodes — those live in `nodetool-huggingface` and are
  tracked in `FIX-MODEL3D.md` (separate effort, no overlap).

---

## PR slicing

- [x] **PR-1 "Provider abstraction"** *(landed `703d2f2cf`)*
  - #1 done. No behavior change: `KieProvider` and friends still report no
    `text_to_3d` capability since they don't override `getAvailable3DModels`.

- [x] **PR-2 "Meshy provider"** *(implementation in working tree)*
  - #2 + #4 (Meshy half) + #6 (Meshy tests) all done. **Cost tracking (#8)
    deferred** to a follow-up — Meshy's per-task credit model differs from
    the runtime's per-token `CostCalculator`, deserves its own pass.
  - Wires Meshy into the registry; node `process()` still throws (PR-4).
  - 21 new tests pass; 64 existing registry/barrel/base-provider tests
    unchanged.

- [x] **PR-3 "Rodin provider"** *(implementation in working tree)*
  - #3 + #4 (Rodin half) + #6 (Rodin tests) all done.
  - Cost tracking deferred (same reasoning as PR-2).
  - 25 new tests pass; 64 existing registry/barrel/base-provider tests
    unchanged.
  - Bug fix vs Python original: single-submit instead of double-submit in
    `imageTo3D`.

- [ ] **PR-4 "Wire up the nodes"** *(small but user-visible)*
  - #5 + #7. This is the PR that **resolves Bug 1b** in
    `PLAN-Model3DNodesRefactor.md` — flip the checkbox there too.
  - Must land after PR-2 (Meshy is the default in `defaults.ts`).
  - Optional: add a third checkbox to PR-2 / PR-3 confirming the smoke test
    in #7 covers both Meshy and Rodin paths.

---

## Done when

- [ ] `TextTo3DNode` and `ImageTo3DNode` no longer throw `NotImplemented`
  when a provider API key is configured.
- [ ] With `MESHY_API_KEY` set, running `TextTo3DNode` end-to-end produces
  a valid GLB that loads in `Model3DViewer.tsx`.
- [ ] With `RODIN_API_KEY` set, same for Rodin.
- [ ] `providerCapabilities(meshy)` returns `["text_to_3d", "image_to_3d", ...]`.
  The provider sidebar in the web app surfaces both capabilities.
- [ ] Bug 1b in `PLAN-Model3DNodesRefactor.md` is checked off with a link to
  the PR-4 commit.
- [ ] No regressions in the existing `KieProvider` / `FalProvider` paths
  (run their existing tests).
