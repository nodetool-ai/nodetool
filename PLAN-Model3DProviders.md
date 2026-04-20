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

- [ ] **#1 – Extend `BaseProvider` with 3D capabilities**
  Add to `packages/runtime/src/providers/base-provider.ts`:
  - `"text_to_3d"` and `"image_to_3d"` to the `ProviderCapability` union.
  - Capability detection in `providerCapabilities()` for the new methods.
  - `getAvailable3DModels(): Promise<Model3D[]>` returning `[]` by default.
  - `textTo3D(params: TextTo3DParams): Promise<Uint8Array>` defaulting to
    `throw new Error("${this.provider} does not support textTo3D")`.
  - `imageTo3D(image: Uint8Array, params: ImageTo3DParams): Promise<Uint8Array>`
    defaulting to throw.
  - Update `Model3D` JSDoc + add `outputFormats?: string[]` to the interface.

- [ ] **#2 – Port `MeshyProvider`** (`packages/runtime/src/providers/meshy-provider.ts`)
  Direct port of `nodetool-core@25e60910:src/nodetool/providers/meshy_provider.py`:
  - `aiohttp` → `fetch` (Node 18+, same pattern as `KieProvider`).
  - `asyncio.sleep` → `await new Promise(r => setTimeout(r, ms))`.
  - `base64.b64encode` → `Buffer.from(bytes).toString("base64")`.
  - Polling state machine + status enums (`SUCCEEDED`, `FAILED`, `EXPIRED`)
    map 1:1.
  - Methods: `getAvailable3DModels()`, `textTo3D()`, `imageTo3D()`.
  - Models exposed: `meshy-4`, `meshy-3-turbo`, `meshy-4-image`,
    `meshy-3-turbo-image` — copy from the Python `MESHY_3D_MODELS` constant.
  - `static requiredSecrets() { return ["MESHY_API_KEY"]; }`.

- [ ] **#3 – Port `RodinProvider`** (`packages/runtime/src/providers/rodin-provider.ts`)
  Direct port of `nodetool-core@25e60910:src/nodetool/providers/rodin_provider.py`.
  Same pattern as #2, different API endpoints. Models exposed: copy from the
  Python `RODIN_3D_MODELS` constant.

- [ ] **#4 – Register the new providers**
  In `packages/runtime/src/providers/index.ts`:
  ```ts
  registerBuiltinProvider("meshy", MeshyProvider, {
    MESHY_API_KEY: process.env["MESHY_API_KEY"]
  });
  registerBuiltinProvider("rodin", RodinProvider, {
    RODIN_API_KEY: process.env["RODIN_API_KEY"]
  });
  ```
  Plus `export { MeshyProvider, RodinProvider }`.

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
  Port `nodetool-core@25e60910:tests/chat/providers/test_meshy_provider.py`
  (139 lines) and `test_rodin_provider.py` (143 lines) to
  `packages/runtime/tests/providers/`. Use the existing `fetch` mock pattern
  from the `KieProvider` test file. Cover at least:
  - Successful submit + poll + download path for both `textTo3D` and
    `imageTo3D`.
  - `FAILED` task status raises with the upstream error message.
  - Missing API key raises a clear error before hitting the wire.
  - Polling timeout raises with a useful message.

- [ ] **#7 – Smoke test for the wired-up nodes**
  In `packages/base-nodes/tests/`, add a test that instantiates `TextTo3DNode`
  and `ImageTo3DNode` with a mock provider and asserts the output shape is
  `{ output: Model3DRef }` with `format: "glb"`. This is the regression test
  for Bug 1b — it must catch any future stub regression.

---

## Cost tracking

- [ ] **#8 – Add Meshy / Rodin pricing entries**
  In `packages/runtime/src/providers/cost-calculator.ts`, add per-task pricing
  for the four Meshy models and the Rodin models. Source from each provider's
  pricing page; cite the URL in a comment so future bumps are easy.
  - Meshy pricing: <https://www.meshy.ai/pricing> (per-task credits).
  - Rodin pricing: <https://hyperhuman.deemos.com/api/pricing>.
  - These are not language-model-style token costs; treat them as flat
    per-call costs keyed by model id.

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

- [ ] **PR-1 "Provider abstraction"** *(small, mechanical, no behavior change)*
  - #1 only. Keeps the existing `Throw NotImplemented` nodes intact.
  - Verifies the new methods compile and the capability detection works
    against `KieProvider` (which still doesn't override → still no
    `text_to_3d` capability).

- [ ] **PR-2 "Meshy provider"** *(medium)*
  - #2 + #4 (Meshy half) + #6 (Meshy tests) + #8 (Meshy pricing).
  - Wires Meshy into the registry but **does not** touch the node `process()`.
  - Verify in isolation: `getRegisteredProvider("meshy")?.getAvailable3DModels()`
    returns the four models when `MESHY_API_KEY` is set.

- [ ] **PR-3 "Rodin provider"** *(medium, parallel to PR-2 if useful)*
  - #3 + #4 (Rodin half) + #6 (Rodin tests) + #8 (Rodin pricing).
  - Same shape as PR-2.

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
