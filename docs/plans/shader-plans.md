# Shared Shader Pool — Phase 0: Foundations shipped (compositor branch)

**ID:** `P-2026-05-20-shared-shader-pool-phase-0-compositor`
**State:** done (PR #3228, branch `claude/unify-compositor`)
**Tags:** shader-pool, webgpu, compositor, blend-modes, phase-0

The compositor-unification work landed a cross-runtime GPU package this plan now builds on. It was hand-rolled (not TypeGPU) and scoped to blend/compositing, but it already establishes the package home, the cross-runtime split, the canonical blend catalog, and a shared multi-layer compositing engine. Phase 1 grows it into the typed shader pool rather than starting from `web/src/lib/gpu/`.

**Shipped in `packages/compositor/`** (renamed to `packages/gpu/` in Phase 1):
- `blendModes.ts` — canonical `BlendMode` union + `BLEND_MODE_TUPLE`, stable `gpuId`s, and Canvas2D / Sharp-libvips mappings. Single source of truth, consumed by the sketch editor, the timeline preview, the `CompositorNode` (server-side Sharp via `blendModeToSharpBlend`), and `packages/protocol`'s timeline Zod schema (`BLEND_MODE_TUPLE`).
- `wgsl.ts` — `WGSL_BLEND_FUNCTIONS`: the shared `applyBlendMode` switch keyed on `gpuId`, injected into both sketch and timeline fragment shaders.
- `webgpu/compositor.ts` — `WebGPULayerCompositor`: owns the blend + blit pipelines, ping-pong accumulation textures, sampler, and a per-frame uniform-buffer ring. Drives both sketch (`nearest` filtering, pixel-exact paint) and timeline (`linear` + rounded-rect mask). This is the "composite layer" primitive the original plan slotted for Phase 4 Batch 4 — it shipped early as **shared host-runtime**, which is why the thesis boundary below now puts layer compositing on the shared side.
- `webgpu/shaders.ts` — fullscreen-quad vertex + blend/blit fragment shaders.

**Cross-runtime split already in place.** The package root export is pure (catalog + WGSL strings, no WebGPU runtime), Node-importable by `base-nodes`; the `./webgpu` export is browser/WebGPU-only. This is exactly the boundary Phase 4's Node.js/Dawn goal needs, so that becomes a context-adapter detail rather than a port.

**Two deltas from the original plan, resolved in Phase 1:**
1. Home is a package, not `web/src/lib/gpu/`. → rename `packages/compositor/` → `packages/gpu/`, fold the blend catalog under `blend/` and the layer engine under `compositor/`.
2. Shipped code is hand-rolled (`@webgpu/types` + manual uniform packing). → still adopt TypeGPU per the original plan; `WebGPULayerCompositor` is retrofitted onto TypeGPU schemas/layouts in Phase 1.

---

# Shared Shader Pool — Phase 1

**ID:** `P-2026-05-12-shared-shader-pool-phase-1`
**State:** in progress
**Tags:** shader-pool, webgpu, typegpu, phase-1, sketch, timeline
**Repo:** default (`packages/gpu/`)

**Depends on:** Phase 0.

**Progress (branch `claude/typegpu-gpu-shaders-XvH3O`):** TypeGPU adopted as a hard dependency. Shipped: the `blend/` + `compositor/` restructure; the TypeGPU-backed pool primitives (`module.ts` `defineModule`/`ShaderModule`, `texture.ts` `LabeledTexture`, `context.ts` `GPUContext` + bucketed scratch + device adapters, `registry.ts`, `executor.ts` fragment arm, `fullscreenQuad.ts`); the `_canary.passthrough@1` module + `ALL_SHADERS` barrel; the `WebGPULayerCompositor` retrofit onto a TypeGPU `d.struct` uniform schema + typed bind group layouts (byte-identity locked by a unit test). Tests: registry/module/canary unit suites + a GPU smoke test that runs the canary against a 4×4 texture when a device is available (skips otherwise). **One deviation from the plan:** the pool primitives live behind a dedicated `./pool` export rather than folded into the package root. The root stays pure (blend catalog only, no TypeGPU import) so Node consumers (`base-nodes`) keep their zero-GPU import path, and so web's Jest — which mocks ESM deps rather than transforming them — only needs a TypeGPU mock on the `./webgpu` (compositor) path, not on every blend-catalog importer. Remaining: confirm the full repo `typecheck`/`lint`/`test` matrix in CI (web/electron deps weren't fully buildable in the authoring sandbox).

Phase 1 of the Shared Shader Pool migration. **Renames `packages/compositor/` → `packages/gpu/`** and grows it into the shared home for WGSL source bundled with its typed bind group layout, typed uniform schema, sampler config, and I/O contract. The blend catalog, shared WGSL, and `WebGPULayerCompositor` from Phase 0 move under it (`blend/`, `compositor/`). No migration of timeline/sketch *effect* code yet — Phase 1 ships the *primitives* (TypeGPU-backed `ShaderModule`/Executor/registry), retrofits `WebGPULayerCompositor` onto the typed layout, and proves the pattern with one end-to-end canary.

**Thesis:** Share things that have one correct answer regardless of consumer. Don't share things whose correctness depends on the consumer.
- Shared: WGSL + bind group layout + sampler config + typed uniform packer + I/O contract + small Executor + the layer-compositing engine (`WebGPULayerCompositor`, shared as of Phase 0).
- Host-owned: scheduling, texture lifetime, presentation, recipe execution policy (until proven worth sharing).

**Goal:** Establish the `ShaderModule` artifact, `LabeledTexture` wrapper, `GPUContext` adapter, and registry — all TypeGPU-backed — so later phases never re-derive uniform layouts or bind group layouts by hand.

**Direction:** Shared pool is a GPU operation catalog with a tiny runtime, not a universal renderer. The runtime covers single-pass texture-in/texture-out (and later multi-pass recipes); scheduling, lifetime, and presentation stay with each host.

## Key contracts

- **Atomic unit of reuse is `ShaderModule`**, not a `.wgsl` file. A module bundles WGSL + a TypeGPU bind group layout + sampler descriptor(s) + a TypeGPU `d.struct` uniform schema + a declared I/O contract. There is no way to import "just the WGSL."
- **Every texture in flight is a `LabeledTexture`** carrying `colorSpace`, `alpha`, `format`, `dimensions`, `bindingKind`. The Executor validates inputs against the module's declared I/O at bind time; mismatches fail loud or route through a registered conversion.
- **Host portability** via `GPUContext` adapter holding a `TgpuRoot` obtained from `tgpu.initFromDevice({ device })`. The same module code runs against browser `navigator.gpu`, Electron, and Node.js Dawn (`webgpu` npm package) devices.
- **Surface from day one:** `surface: "internal"` (free to churn) vs `surface: "published"` (frozen, additive-only, what workflow nodes are allowed to see in Phase 4). Promotion is a deliberate review, never a side effect of writing a shader.
- **Versioned IDs.** A module is `(id, version)`. Saved workflows pin a version; renames/splits ship as new versions, never in-place.
- **Canonical inputs and the mask slot.** Image-in/image-out modules (filter, color, keyer, transform, mixer) declare:
  - **`source`** — required main texture input. The string `"source"` is reserved across `IOContract`, recipes (`in: { foo: "source" }`), and dimension propagation (`"same-as:source"`).
  - **`mask`** — optional mask texture input. **Modules in these categories should expose a `mask` slot by default.** Region-constrained effects ("blur only the background", "desaturate everything except this layer", "vignette inside a clipping shape") are how filters and color ops are actually used in real workflows; a catalog of 50 modules with no mask slot is a catalog that needs retrofitting. Treat omitting `mask` as the deliberate exception (e.g. `color.invert` on a thumbnail), not the default.

  When a module exposes a `mask` slot:
  - Coverage is read from `mask.a` by default; modules may declare `mask.r` for single-channel masks.
  - The effect convention is `output = mix(source, processed, coverage * effectAmount)`.
  - Missing-mask semantics are executor-enforced: sampling an unbound `mask` returns `1.0` everywhere via a 1×1 white texture the host supplies. Modules write the WGSL as if the mask is always present.

  Source modules (`io.inputs = {}`) and recipes that internally generate textures are exempt. Multi-input modules (composite, channel-merge) declare their own input names; the `mask` slot, if used, keeps the same semantics.
- **Working color space is linear; storage may be sRGB-encoded.** The Executor relies on WebGPU's automatic sRGB→linear at sample time and linear→sRGB at write time via `*-srgb` formats. Alpha is **premultiplied between modules**. `LabeledTexture.meta` records storage encoding; modules declare per-input `colorSpace` and `alpha` (what they expect); mismatches insert a registered conversion (under `color/convert/*`, auto-inserted by the Executor) or fail loud.
- **Coordinates:** normalized UVs `[0,1]`, top-left origin, explicit output dimensions.
- **No executor-inserted readback.** `Executor.encode`/`RecipeRunner.encode` encode GPU work only — they never call `copyTextureToBuffer`, `mapAsync`, or any path that pulls pixels to CPU as part of a normal FX path. **`ImageRef` materialization remains a deliberate host-side step** at Phase 4 workflow boundaries (decode on the way in, encode/readback on the way out). That invariant is required for realtime: the display path stays GPU-resident at frame rate; CPU readback, when needed, happens only at explicit boundaries (e.g. sampling one frame into a workflow, or feeding an inference node at inference rate — both owned by the realtime host layer, see Phase 5).
- **Registry uses explicit `ALL_SHADERS` barrel** (not `import.meta.glob`). Node-bundling-safe, grep-able, tree-shakeable.

## Cache key shape (specified now, implemented later)

A future cache key is `(module.id, module.version, params_hash, inputs_content_hash, output_spec_hash)`. This forces three constraints on every module today, even though no cache exists yet:

- Params must be hashable — no function values, no mutable refs.
- `LabeledTexture` exposes a content version counter, incremented on every write. That is the `inputs_content_hash` source; full pixel hashing is not required.
- Modules must not read hidden global state inside WGSL — all inputs flow through declared bindings and uniforms.

The cache itself lands when Phase 3's timeline preview needs it. Specifying the key shape now is what makes the eventual cache cheap.

## Scratch pool: bucketed allocation

`ctx.scratch` allocates by bucket: `(format, usage, ceilToBucket(width), ceilToBucket(height))` where bucket dims round up to the next multiple of 64 (or next power of 2 above 256). The caller sees only the requested viewport; the underlying texture may be larger. Phase 1 ships the canary using a single scratch texture; the bucketing rule is what Phase 3's `RecipeRunner` will lean on so timelines with many clip resolutions (1920×1080, 1920×800 letterboxed, 1280×720, 3840×2160, plus thumbnails) reuse rather than fragment.

## Dependency: TypeGPU

Adopted in Phase 1. Reasons:
- One typed schema (`d.struct`) per module is the source of truth for both the WGSL `*Uniforms` struct and the host-side packed buffer. As modules grow (vec3 padding, struct arrays, mixed scalar/vec fields) hand-rolled `Float32Array`/`DataView` math gets fragile; today's timeline code is straightforward typed-array writes, so this is preventative, not corrective.
- Hand-rebuilt bind group layouts in each host are real drift risk. TypeGPU's typed layouts are the source of truth; `root.unwrap(layout)` returns the `GPUBindGroupLayout` that the WGSL was authored against.
- `tgpu.initFromDevice({ device })` accepts any `GPUDevice` — browser, Dawn, Electron — so the cross-runtime story is inherited rather than designed.
- WGSL stays hand-written; `tgpu.resolve(...)` connects it to the typed layout. The TS-to-WGSL compiler (`'use gpu'`) is not adopted.

## Phase 1 scope

> **Starting point.** Phase 0 shipped `packages/compositor/` (canonical blend catalog, shared WGSL, `WebGPULayerCompositor`, cross-runtime entry split) hand-rolled against `@webgpu/types`. Phase 1 renames it to `packages/gpu/` and layers the TypeGPU-backed contracts on top. Existing consumers (`web`, `packages/timeline`, `packages/base-nodes`, `packages/protocol`) import the package; the rename is a coordinated `@nodetool-ai/compositor` → `@nodetool-ai/gpu` update plus the Jest/Vitest module-mapper entries.

1. **Rename the package** `packages/compositor/` → `packages/gpu/` (`@nodetool-ai/gpu`); move existing files to `src/blend/` (`blendModes.ts`, `wgsl.ts`) and `src/compositor/` (`WebGPULayerCompositor`, shaders). Keep the dual entry points: pure root (`./` — catalog + WGSL, Node-safe) and `./webgpu` (engine). Update all consumers and test module mappers.
2. Add `typegpu` dependency to `packages/gpu/package.json`.
3. Create the pool primitives in `packages/gpu/src/`:
   - `module.ts` — `defineModule()` builder + `ShaderModule<P>` type
   - `texture.ts` — `LabeledTexture` wrapper + creation helpers
   - `context.ts` — `GPUContext` interface + default browser adapter using `navigator.gpu`
   - `registry.ts` — `register()`, `get({ id, version, surface })`, `list({ surface, category })`
   - `index.ts` — public barrel
4. **Retrofit `WebGPULayerCompositor` onto TypeGPU.** Replace its hand-packed 4×vec4f uniform `Float32Array` and hand-built bind group layout with a TypeGPU `d.struct` schema + typed layout (`root.unwrap(layout)` returns the `GPUBindGroupLayout` the WGSL is authored against). Behavior, the `gpuId`-keyed blend switch, and the per-frame uniform-buffer ring are preserved; this is the first real proof the typed contracts hold for a non-trivial existing shader, not just the canary.
5. One canary module at `src/shaders/_canary/passthrough/v1/module.ts` that copies an input texture to an output texture. Proves: TypeGPU schema → bind group → WGSL resolution → executor → labeled output, end-to-end, in one file.
6. Smoke test: from a Vitest file that creates a software-rasterizer `GPUDevice` (or skips if unavailable), run the canary against a 4×4 texture and assert pixel equality. Keep the existing Phase 0 tests (blend catalog, inverse-affine) green through the rename.

## Non-goals (Phase 1)

- No migration of timeline or sketch shaders yet.
- No Executor consumer beyond the canary.
- No RecipeRunner (multi-pass orchestration arrives in Phase 3).
- No Node.js host code yet — the contracts are Node-ready, the adapter is browser-only.
- No published-surface modules yet.

---

# Shared Shader Pool — Phase 2: Migrate Timeline Compute Effects

**ID:** `P-2026-05-13-shared-shader-pool-phase-2-compute-effects`
**State:** draft
**Tags:** gpu, shaders, timeline, typegpu, executor, phase-2
**Repo:** default (`packages/gpu/`)

**Depends on:** Phase 1
**Scope:** Convert the five timeline compute effects into `ShaderModule` form (TypeGPU-backed), introduce the shared `Executor`, and refactor `WebGPUEffectsProcessor` to dispatch through it. Hand-written uniform packing in timeline goes away.

## Goal

Promote the timeline's existing WebGPU compute effects into the shared pool so they become reusable operations for timeline, sketch, and future export paths. Preserve timeline behavior end-to-end. The payoff is that all five effects run through one Executor with one typed packer per module — no host-side ArrayBuffer arithmetic survives this phase.

## Effects in scope

- color grading (`color.grade`)
- Gaussian blur (`filters.blur.gaussian`)
- sharpen / unsharp mask (`filters.sharpen.unsharpMask`)
- vignette (`filters.vignette`)
- chroma key (`keyer.chromaKey`)

All five remain `surface: "internal"` in Phase 2. Promotion to `published` happens deliberately in Phase 3 once parameter schemas are stable.

## Current code

- Timeline compute shader source: `web/src/components/timeline/preview/gpu/shaders.ts` (per-clip effect compute passes; **distinct from** the layer-composite pass, which already runs through `WebGPULayerCompositor` after Phase 0).
- Timeline compute execution host: `web/src/components/timeline/preview/gpu/effectsProcessor.ts`
- Phase 1 shared pool: `packages/gpu/src/`

## Executor (introduced this phase)

```ts
interface Executor {
  encode<P>(args: {
    ctx: GPUContext;
    module: ShaderModule<P>;
    encoder: GPUCommandEncoder;
    inputs: Record<string, LabeledTexture>;
    output: LabeledTexture;
    params: P;
    dispatch:
      | { kind: "fragment" }
      | { kind: "compute"; x: number; y: number; z?: number };
  }): void;
}
```

The `dispatch` discriminator is set now even though Phase 2 only uses the `compute` arm — making it a discriminated union from day one means fragment passes (the default for image-in/image-out from Phase 3 onwards) drop in without an Executor signature change.

Single shared implementation. Steps per call: resolve variant (Phase 3 expands this), validate input labels against `module.io.inputs`, get-or-compile pipeline via `ctx.pipelineCache`, pack `params` via the module's TypeGPU schema, build the bind group from the module's typed layout, encode the compute dispatch. The host owns *when* to submit and *where* the output texture lives.

## ShaderModule shape after Phase 2

```ts
interface ShaderModule<P> {
  id: string;                                     // "color.grade"
  version: number;                                // 1
  surface: "internal" | "published";
  category: ShaderCategory;
  kind: "fragment" | "compute" | "snippet";       // fragment is default for image-in/image-out

  params: TgpuStructSchema<P>;                    // TypeGPU schema
  paramDefaults: P;
  paramUi?: Record<keyof P, UiHint>;              // min/max/step/notes; no runtime semantics

  bindGroupLayout: TgpuBindGroupLayout;           // TypeGPU layout
  samplers: Record<string, GPUSamplerDescriptor>; // bundled with module
  wgsl: string;                                   // hand-written
  entryPoint: string;
  workgroupSize: [number, number, number];

  io: IOContract;
}
```

`IOContract` declares per-input `colorSpace`, `alpha`, `bindingKinds`, and an output spec with `dimensions: "same-as:<inputName>" | "host-specified" | "derived"`. The Executor checks `LabeledTexture.meta` against this.

**Default kind for new modules is `fragment`.** Filters, color, keyer, sources, transform, and mixer ops use a full-screen triangle render pass — no workgroup boundary handling, free interpolation, easier blending. Phase 2's five timeline effects stay on `compute` because that's what the existing shaders use; this is a migration accident, not a design choice. New modules from Phase 3 onward default to fragment. `compute` is reserved for ops that genuinely need shared memory or reductions (histogram, summed-area tables, FFT-style passes).

**RoD propagation.** Every module's `IOContract` declares an `rod` field:

```ts
rod: "same-as:source" | "expand:<paramName>" | "union-of-inputs" | "explicit"
```

Phase 1–2: every module declares `"same-as:source"`. The Executor does nothing with it yet. Phase 3 onwards, blur declares `"expand:radius"`, crop declares `"explicit"`, composite declares `"union-of-inputs"`. RoI propagation, tiling, and partial-region re-cooks are explicitly out of scope until a real consumer demands them — only the RoD declaration is required now, because retrofitting it across a 50-module catalog is the kind of thing that gets perpetually deferred.

## Migration steps

1. Define `Executor` in `packages/gpu/src/executor.ts`. One implementation, shared.
2. Migrate each timeline shader to `packages/gpu/src/shaders/<category>/<id>/v1/module.ts` using `defineModule`. WGSL bodies move verbatim; bindings and the uniform struct are translated into TypeGPU schema/layout once.
3. Refactor `WebGPUEffectsProcessor` to call `Executor.encode(...)` per effect. Effect ordering, host-owned scratch textures, and pass scheduling stay unchanged. Hand-written `ArrayBuffer` packing is removed.
4. Sketch's existing effect path is untouched — it migrates in Phase 3 as part of the catalog expansion work.
5. Delete migrated entries from `web/src/components/timeline/preview/gpu/shaders.ts`.

## Variant policy

No variant routing in Phase 2. Variants land in Phase 3 when a concrete second binding kind appears (`texture_external` for the timeline video fast path is the first real case).

## Risks (Phase 2)

- **Uniform layout drift between WGSL struct and TypeGPU schema.** Mitigation: a build-time check that parses the first `*Uniforms` struct in each module's WGSL and compares field names + WGSL types to the TypeGPU schema. Fails CI on mismatch. This is the same idea as the original plan's struct-name check, made authoritative.
- **Sampler/bind-group divergence with current host code.** Mitigation: `WebGPUEffectsProcessor` stops creating its own samplers and layouts for migrated ops; the Executor uses the module's declarations exclusively.
- **Performance regression from per-call validation.** Mitigation: label validation is O(inputs) and runs once per encode; pipeline creation is cached. Measure timeline frame time before and after on a 1080p clip with all five effects active.

## Validation

- Registry tests: each migrated module has `kind: "compute"`, `surface: "internal"`, valid `params` schema, valid `io`, non-empty `wgsl`.
- Layout test: TypeGPU schema field set matches WGSL `*Uniforms` struct.
- Pixel-identity test: run the Executor path and the old `WebGPUEffectsProcessor` path on the same input + params and assert byte equality of the output for each effect.
- Timeline tests pass.
- Manual smoke: timeline playback with color grading, blur, sharpen, vignette, chroma key active.
- `npm run typecheck`, `npm run lint`, `npm run test` clean from `web/`.

## Non-goals (Phase 2)

- No new effects.
- No sketch migration.
- No multi-pass recipes (Phase 3 Batch 4).
- No variant routing.
- No published-surface ops.
- No Node.js host (Phase 4).

---

# Shared Shader Pool — Phase 3: Catalog Expansion + RecipeRunner

**ID:** `P-2026-05-13-shared-shader-pool-phase-3-shader-catalog-expansio`
**State:** in progress
**Tags:** gpu, shaders, catalog, typegpu, recipes, phase-3
**Repo:** default (`packages/gpu/`)

**Depends on:** Phase 1, Phase 2
**Scope:** Grow the catalog in reviewable batches, introduce `RecipeRunner` for multi-pass operations when Batch 4 needs it, formalize variant resolution against host capabilities, and start promoting stable modules to `surface: "published"`.

**Progress (branch `claude/shader-plan-phases-2-3-2Q7Fo`):** Structural foundations shipped — `RecipeRunner` (`packages/gpu/src/recipe.ts`) with `defineRecipe`/`RecipeModule`, variant-resolution scaffolding (`module.ts` `ShaderVariant`, `executor.ts` `resolveVariant`), and executor mask-slot support (1×1 white fallback for unbound optional inputs via `GPUContext.getDefaultWhiteTexture`). Registry widened to store both `ShaderModule` and `RecipeModule` via `AnyShader`, with narrowed `getShader`/`getRecipe` for the two execution paths. Catalog expansion (all `kind: "fragment"`, mask slot on filter/color/keyer ops by default): Batch 1 — `color.{invert,brightnessContrast,hsb,exposure,posterize}`, `filters.{pixelate,threshold}`, `keyer.lumaKey`, `mask.{apply,fromImage,invert}`. Batch 2 — `sources.{solid,linearGradient,checkerboard,radialGradient,angularGradient,diamondGradient}`. Batch 3 (partial) — `transform.{mirror,offset,crop}`. Batch 4 — `mixer.add` (`mixer.composite` still wraps `WebGPULayerCompositor`, deferred) and the first recipe `filters.glow@1` (`threshold → blurH → blurV → mixer.add`) wired through `RecipeRunner`. Surface promotion: the five Phase 2 modules (`color.grade`, `filters.{blur.gaussian,sharpen.unsharpMask,vignette}`, `keyer.chromaKey`) plus Batch 1 high-confidence subset (`color.{invert,brightnessContrast,hsb}`, `keyer.lumaKey`, `mask.apply`) promoted to `surface: "published"` — locked by `tests/surfacePromotion.test.ts`. **Deferred to follow-up** (still draft below): the rest of Batch 3 (pad/tile/resize/rotate90/affine/cornerPin/polarRemap/displace/spherize), Batch 5 (advanced color — levels/curves/gradient map/BW/balance/remap/local contrast/tonemap/dither/quantize), the rest of Batch 1 (gradient/noise/pattern/shape generators, blur variants, edge detect, normal map, mask refine ops), sketch's per-op migration to `Executor.encode`, and `TimeContract` integration. Variant resolution lookup logic is unit-tested (`tests/variant.test.ts`) but no shipping module has multiple variants yet — added when a concrete second consumer (the realtime `texture_external` path) ships.

## Goal

Turn the shared pool from a five-effect internal catalog into a useful operation library for sketch, timeline preview/export, and future workflow nodes. Every new op is a `ShaderModule` from day one — no hand-rolled packers, no host-side bind group construction.

## Selection rules

Prioritize operations that are:
- useful in both sketch and timeline,
- pure GPU texture-in/texture-out (or zero-input → texture-out for sources),
- deterministic and snapshot-testable,
- independent of host UI state,
- expressible inside the existing `ShaderModule` shape.

Defer operations that need text shaping, SVG parsing, brush/spline UI, ML, graph-level packing decisions, or CPU flood fill / selection bookkeeping. Those are Phase 4+ orchestration concerns, not shaders.

## Batches

### Batch 1: Low-risk shared effects
Filters (pixelate, blur variants, emboss, high pass, edge detect, normal map, seamless blend), color (invert, brightness/contrast, hsb, exposure, posterize), keyer (luma key), mask ops (fromImage, apply, boolean, refine erode/dilate, refine feather). Sketch starts consuming `color.*` and `filters.*` modules through the Executor during this batch.

### Batch 2: Generators and sources
Zero-input, one-output. Solid canvas, gradients (linear/radial/angular/diamond), noise (white/value/perlin/simplex/voronoi/clouds/cellular/curl/domainWarp/fbm/ridged/turbulence), patterns (checkerboard/stripes/dots/hexagons/brick), shapes (circle/rectangle/polygon/star/ring).

Source modules declare:
- `io.inputs = {}`
- `io.output.dimensions = "host-specified"` (required host params `width`, `height`)
- typical params: `seed`, `scale`, `offset`, `rotation`, `repeat`, `backgroundColor`
- output defaults to `rgba8unorm`, straight alpha, SDR sRGB
- deterministic for identical params/seed
- animated sources deferred until timeline/workflow scheduling needs them

Noise:
- Start with one `sources/noise/v1` module + user-friendly `style` enum param.
- Hash/interpolation/fBm/domain-warp snippets live in `utils/noise.*.wgsl.ts` and are imported via `tgpu.resolve()` only when shared by 2+ modules.
- Split vector-field outputs (`sources/noiseVector.curl`) when the output contract differs.
- User-facing params: `style`, `scale`, `layers`, `detail`, `roughness`, `seed`, `contrast`, `warp`, `output`. `lacunarity`/`gain` hidden behind an advanced foldout.

### Batch 3: Transform operations
Crop, pad, mirror, offset, tile, resize (nearest/bilinear/bicubic), rotate90, affine, cornerPin, polarRemap, displace, spherize.

Module-level defaults:
- `io.output.dimensions`: `same-as:source` for filters/color/keyer/most masks; `host-specified` for sources; `derived` for crop/pad/some resize.
- Sampler `addressMode`: `clamp-to-edge` for convolution; `clamp-to-edge` with shader-side alpha-out for transforms exposing empty space; `repeat`/`mirror-repeat` only on explicit tiling/repetition modules.
- Sampler filter: `linear` general, `nearest` for pixel-art/rotate-90.

Defer `arrange`, `spriteSheet`, `trim` — they need graph-level layout decisions outside the shader.

### Batch 4: Mixer and layer effects + RecipeRunner
Composite layer, color overlay, drop shadow, outline, channel merge/split/shuffle.

> **Composite layer already exists** as `WebGPULayerCompositor` (Phase 0), retrofitted onto TypeGPU in Phase 1. Batch 4's job here is not to build it but to decide whether the multi-layer blend/ping-pong engine is exposed as a single `mixer.composite` `ShaderModule` (one pass per layer driven by the Executor) or stays a bespoke runtime the recipe layer calls into. Lean: keep `WebGPULayerCompositor` as the runtime and add a thin `mixer.composite` module that delegates, so the blend math (already shared via `blend/wgsl.ts`) isn't forked again.

This batch introduces `RecipeRunner`:

```ts
interface Recipe<P> {
  intermediates: Record<string, TextureSpec>;
  passes: Array<{
    op: string;                                            // "internal.blur.gaussianH@1"
    in: Record<string, "source" | string>;                 // "source" or intermediate name
    out: "output" | string;
    params: Record<string, JsonPath<P> | unknown>;         // "$.radius" or literal
  }>;
}

interface RecipeRunner {
  encode<P>(args: {
    ctx: GPUContext;
    module: ShaderModule<P>;                                // must have `recipe`
    encoder: GPUCommandEncoder;
    inputs: Record<string, LabeledTexture>;
    output: LabeledTexture;
    params: P;
  }): void;
}
```

Default `RecipeRunner` walks the passes, acquires intermediates from `ctx.scratch`, calls `Executor.encode` per pass, releases in reverse. Intermediate formats are declared in the module (not chosen by host) — that's the only way `filters.glow` produces the same output everywhere.

Example: `filters.glow` recipe = `extract → blur H → blur V → composite` with `rgba16float` intermediates declared in the module.

Channel ops live under `color/` if the UI treats them as color tools. Pick one namespace before implementation.

### Batch 5: Advanced color
Levels, curves, gradient map, black-and-white, color balance, color remap, local contrast, tonemap, dither (ordered/floydSteinberg), quantize.

Before starting Batch 5, decide how LUTs / curves / palettes / gradients are supplied:
- Curves: per-channel generated 1D LUT texture (bound as `texture_2d` with height 1).
- Gradient map: 1D LUT from color stops.
- Built-in creative LUTs: static assets, packed 2D / 3D-emulated.
- Levels: per-channel black/white point, gamma, output black/white as TypeGPU schema fields.
- Tonemap: one module with `mode = none | reinhard | aces | filmic`. Full HDR pipeline is a separate plan.
- Start SDR-first.

## Variant resolution

Variants become first-class this phase. A module may declare multiple variants with different `bindGroupLayout` (e.g. `texture_external` vs `texture_2d` for `source`) and different `requires: { textureExternal?: boolean; f16Storage?: boolean }`.

The Executor resolves a variant by matching `inputs[*].meta.bindingKind` against each variant's `bindGroupLayout` and filtering by `ctx.capabilities`. Timeline gets the `texture_external` fast path automatically; Node.js Dawn falls back to `texture_2d`; sketch picks whichever its uploads produce.

**`texture_external` and camera/video (realtime alignment).** A registered `color/convert/srgbExternalToLinear` module (exact id TBD) is the canonical consumer of `texture_external` for sRGB-encoded `VideoFrame`/camera surfaces: bind the external texture in the **same** command-buffer submission where it was imported, emit linear premultiplied `rgba8unorm` (`texture_2d`), everything downstream binds regular textures. Matches WebGPU's rule that imported external texture handles expire at submit. Realtime capture spikes and minimum-viable paths should use this module as the first FX stage.

Variants are added only when a concrete second consumer or binding kind exists. `interactive`/`export` quality variants stay deferred until a real quality/perf split is demonstrated.

## Mode parameters vs separate operations

- **Good mode params** (one module, one param picks the algorithm): tonemap, gradient, noise, noiseVector, pattern, shape, blur (gaussian/box), edgeDetect (sobel/prewitt/laplacian; Canny separate), dither, resize, mirror.
- **Separate modules** (different bindings, different pass graphs, or different data model): highPass, glow, normalMap, seamlessBlend; composite, dropShadow, outline; palette extraction/remap.

## Mask conventions

- Coverage in alpha channel by default; R-only allowed for compute internals, user-facing ops declare alpha mapping in `io`.
- Normalized coverage: `0` outside, `1` inside, fractional for feather.
- Feather/blur units are pixels.
- Boolean modes: union, intersect, subtract, xor.
- Refine modes: erode, dilate, feather, threshold, invert.
- `mask.apply` writes mask coverage into output alpha, preserves RGB by default.
- `mask.fromImage` modes: alpha, luminance, R/G/B, max-channel.
- Sketch selection overlays remain `overlays.*`; mask ops produce data, not UI indicators.

## Optional mask inputs

Optional `mask` inputs follow the canonical-inputs contract from Phase 1. Filter/color/keyer/transform/mixer modules in this phase ship with the `mask` slot exposed unless there's a clear reason not to. Timelines that lack mask UI simply pass none — the executor's missing-mask semantics handle it.

## Surface promotion

By end of Batch 3, the five Phase 2 modules plus the high-confidence subset (HSB, brightness/contrast, invert, blur, vignette, lumaKey, mask.apply) promote to `surface: "published"`. Promotion is a deliberate review per module:
- params stable for ≥1 minor release
- I/O contract stable
- no expected near-term rename or split

`published` modules cannot be removed or have their params reordered/removed/retyped. Adding optional params is allowed. Breaking changes ship as a new `version`.

## Timeline parameter animation

```ts
type ParamAnimation = "lerp" | "step" | "none";

interface TimeContract {
  usesTime: boolean;
  timeParam?: "seconds" | "frame";
}
```

Defaults: numeric/vec/color → `lerp`; bool/enum/seed/mode → `step`; runtime-only (texture handles) → `none`. Angle params lerp; hosts choose shortest-path wrapping. Host supplies time/frame as a uniform field declared in the module's TypeGPU schema. Sketch passes a stable value for static rendering.

## Sketch migration (cross-cutting)

Batch 1 begins replacing sketch's per-op WebGPU plumbing with `Executor.encode` calls. By end of Phase 3, sketch and timeline both consume the same Executor and the same `ShaderModule` objects. Sketch retains its own scheduling, texture pool, and presentation surface.

## Variant / module split policy

Most modules start with one default variant. Add additional variants only with a proven binding-kind, capability, or quality split. Likely future candidates: blur, resize, glow, denoise, quantize/dither, keying.

## Deferred / hybrid operations

Not Phase 3 shaders: imageIn (decode/upload), svgImport, text (font shaping), inpaint/denoise (ML or complex multi-pass), edgeDetect.canny (multi-stage with feedback), blur.median/bilateral/edgePreserving (require non-trivial work), smartScale, meshWarp, arrange, spriteSheet, trim (needs readback/bounds detection), magicWand, colorRange (eyedropper UI), roto (spline UI), paint/maskPaint/freehand, palette workflows.

## Validation

Each added module:
- registry metadata test
- shader compile coverage
- TypeGPU schema ↔ WGSL `*Uniforms` field-name check
- golden-image snapshot test where practical
- manual smoke in the first host that consumes it

Avoid adding large batches without tests. Catalog grows in reviewable groups.

## References (use, don't adopt)

- Taxonomy: TextureFX/VL.Addons, Natron, Fusion, Substance Designer, FieldTrip, ISF.
- Algorithms: webgpu-video-shaders, libplacebo/mpv, web video-frame processing guidance, WebGPU Native Examples.
- Helpers: webgpu-utils, ralph-gpu, WebGPU-Kit; Use.GPU linker if snippet assembly becomes painful; compute.toys for future user-authored workflows.
- TypeGPU is a hard dependency since Phase 1, not a reference.

Decision rule: only add another dep if it solves a concrete current-phase problem that TypeGPU + the in-pool helpers don't already cover.

---

# Shared Shader Pool — Phase 4: Workflow Nodes, Node.js/Dawn, and Image Pipeline

**ID:** `P-2026-05-13-shared-shader-pool-phase-4-shader-nodes`
**State:** draft
**Tags:** gpu, shaders, workflow, nodes, nodejs, dawn, sharp-replacement, phase-4
**Repo:** default (`packages/gpu/`)

**Depends on:** Phase 1, Phase 2, Phase 3
**Scope:** Expose `published`-surface modules as workflow graph nodes that chain on the GPU, ship the Node.js Dawn `GPUContext` adapter, and migrate Node-side pixel operations off `sharp` onto the shared catalog.

## Goal

Two outcomes:
1. Workflow nodes generated from the shared catalog, chaining on GPU without intermediate readback, producing `ImageRef` only at workflow boundaries.
2. A single image pipeline shared between editor (sketch, timeline) and headless (Node.js workflow execution, Cloud Run, RunPod): same WGSL, same TypeGPU schemas, same Executor — different `GPUContext` adapters, different I/O codecs.

The first concrete consumer is **texture FX chains**: workflow-graph subgraphs of shader nodes that share GPU textures, materialize an `ImageRef` only at the chain's downstream boundary, and run the same modules sketch and timeline already use. Frame-loop realtime hosts build on Phase 5 of this doc (pool contract); **session lifecycle and workflow partitioning** belong in the separate realtime plan (draft).

Ideal path:

```text
ImageRef → decode/upload → LabeledTexture → shader node(s) → encode → ImageRef
```

## Core idea

Shader nodes accept one logical image input:

```ts
import type { ImageRef } from "@nodetool-ai/protocol";

type ShaderImageInput = ImageRef | GPUTextureRef;
```

Runtime behavior:
- `ImageRef` input: codec decodes to raw pixels, then uploads into a `LabeledTexture`.
- `GPUTextureRef` input: reuse the existing labeled texture directly.
- Shader node output: prefer `GPUTextureRef` for chaining.
- Boundary output: materialize `ImageRef` only when a downstream non-GPU node or workflow output needs persisted image data.

## GPUTextureRef design

- Ephemeral in-process handle wrapping a `LabeledTexture`, not a persisted asset.
- Valid only inside one renderer/workflow execution session.
- Local to one browser/Electron/Node.js process — no cross-worker or cross-process sharing in Phase 4.
- Runtime releases textures when a node output is no longer referenced by downstream nodes (refcounted by graph edges).
- Final materialization happens automatically when an edge connects `GPUTextureRef` output to `ImageRef` input or workflow boundary.

WebGPU is required; unsupported environments fail clearly with no silent CPU fallback.

## Node.js / Dawn support

### Package

- `webgpu` (npm) — Dawn bindings for Node.js, `^0.4.0`
- Repository: https://github.com/dawn-gpu/node-webgpu
- Provides `GPUAdapter`, `GPUDevice`, `GPUTexture`, `GPUCommandEncoder`, etc.

### Adapter

A `NodeGPUContext` is a `GPUContext` built from a Dawn-provided device:

```ts
import { create } from "webgpu";
import tgpu from "typegpu";

async function createNodeGPUContext(): Promise<GPUContext> {
  const gpu = create([]);
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter (Node/Dawn)");
  const device = await adapter.requestDevice();
  const root = tgpu.initFromDevice({ device });
  return {
    root,
    device,
    capabilities: detectCapabilities(adapter, device),
    createTexture: nodeCreateTexture,
    scratch: makeRefcountedScratchPool(device),
    pipelineCache: makePipelineCache(),
  };
}
```

Every Phase 1–3 module runs against this context unchanged because TypeGPU accepts any `GPUDevice` via `initFromDevice`. The Executor, RecipeRunner, registry, variant resolution, validation — all shared code.

### Browser vs Node differences (host adapter only)

| Concern | Browser | Node.js (Dawn) |
|---|---|---|
| Adapter acquisition | `navigator.gpu.requestAdapter()` | `import { create } from "webgpu"` |
| Canvas | `HTMLCanvasElement`, `OffscreenCanvas` | None; headless texture targets |
| Image decode | `createImageBitmap`, `ImageDecoder`, `VideoFrame` | codec library (see image pipeline below) |
| Image encode | `canvas.convertToBlob`, `ImageEncoder` | codec library |
| Texture lifetime | Browser GC drives release | Explicit `texture.destroy()` via refcounted scratch |
| Worker | `OffscreenCanvas` in Worker | Separate Node process; no Worker canvas |

WGSL, TypeGPU schemas, Executor, RecipeRunner are identical across both.

## Image pipeline (sharp replacement)

`sharp` currently does two distinct jobs in Node: **codecs** (decode/encode PNG/JPEG/WebP/AVIF/TIFF, EXIF, ICC) and **pixel ops** (resize, blur, sharpen, modulate, composite, gamma, …). Only the second is in scope for the shader pool.

Target end state:

```text
codec.decode(bytes) ─► LabeledTexture
                        │
                        ▼
                  Executor / RecipeRunner running shared ShaderModules
                        │
                        ▼
                  LabeledTexture ─► codec.encode(...) ─► bytes
```

### What moves to the shared pool

All pixel-in/pixel-out work that `sharp` currently handles:
- resize, crop, rotate, flip, mirror
- composite, blur, sharpen, modulate (HSB), gamma, tint, threshold, normalize, linear, convolve, boolean, recomb, median
- color management: linear/sRGB conversion, tonemap, gamma

These become (or already are) `published` modules. No host re-implements them.

### What stays separate (codec layer)

A thin `@nodetool-ai/image-codecs` package handles:
- decode (PNG/JPEG/WebP/AVIF/TIFF/HEIC → raw RGBA + metadata)
- encode (raw RGBA → PNG/JPEG/WebP/AVIF)
- EXIF/ICC extraction and orientation handling

Codec choice per format is implementation detail. Candidates: native bindings (libvips slim build, libjpeg-turbo, libpng, libwebp, libavif) or pure-JS where acceptable (`@jsquash/*`). The codec layer has no GPU dependency and can ship CPU-only.

### Honest caveat: keep a CPU bypass

For workflows that do "decode → one resize → encode" with no further GPU work, a pure-CPU codec+resize path may beat GPU upload/download cost. Keep a `@nodetool-ai/image-codecs` resize that bypasses the pool for that single-op case. Chains of two or more operations always go through the GPU pipeline.

### Migration order

1. Stand up `@nodetool-ai/image-codecs` with decode/encode for the formats currently used.
2. Migrate Node workflow image nodes that use a single sharp operation last; migrate chains first (biggest win, easiest correctness story).
3. Remove `sharp` from `nodetool-core` and node packs once all consumers are off it. Keep `sharp` as a transitional dev dep in any pack still mid-migration.

## Workflow node shape

Generated from `published`-surface registry entries:

```text
Shader node "color.hsb" (version 1):
  input:  image
  params: hue, saturation, brightness
  output: image
```

Param UI is driven by the module's TypeGPU schema + `paramUi` hints (min/max/step). Execution maps params → uniform → Executor.encode → labeled texture out. Versioned IDs are saved with the workflow; loading a workflow uses `registry.get({ id, version, surface: "published" })`.

The workflow node's `nodeType` (the `NodeRegistry` key in `packages/node-sdk`) **encodes the module version** — e.g. `shader.color.hsb@v2`, not bare `shader.color.hsb`. Without this, upgrading a published module silently changes node behavior in saved workflows. The `@v<n>` suffix is the bridge between the workflow `NodeRegistry`'s string-keyed identity and the shader registry's `(id, version)` identity.

**Workflow-load failure mode.** Loading a workflow that references `(id, version)` not present in the running registry **fails loud at load time**, naming the missing module. No silent fallback to a different version. Migrating saved workflows to a newer version is a deliberate user action with a diff preview. Removing a `published` module requires a deprecation window with a documented replacement — this is the difference between "old workflows still work in two years" and "every release silently breaks somebody's graph."

## Readback policy

Avoid readback between shader nodes. The runner inspects graph edges and only materializes `ImageRef` at GPU-to-non-GPU boundaries or final outputs.

Run as:

```text
ImageRef → upload → texture → HSB → Blur → Vignette → readback → ImageRef
```

Not as:

```text
ImageRef → upload/readback → ImageRef → upload/readback → ImageRef
```

## Good first nodes

Already shared, deterministic, published by end of Phase 3:
- `color.hsb`
- `color.brightnessContrast`
- `color.invert`
- `filters.blur` (gaussian variant)
- `filters.vignette`
- `keyer.lumaKey`
- `mask.apply`

Avoid text, SVG, smart scale, inpaint, paint, magic wand, palette extraction in Phase 4.

## Relationship to sketch and timeline

Shader nodes consume the same registry entries as sketch and timeline. They do not import sketch or timeline host code.

Shared (already in the pool by this point):
- shader source (WGSL)
- bind group layouts (TypeGPU)
- uniform schemas (TypeGPU)
- sampler descriptors
- I/O contracts
- Executor, RecipeRunner, registry
- utility WGSL snippets

Host-specific to workflow nodes:
- workflow execution lifecycle
- per-job scratch pool + pipeline cache
- final asset creation (`ImageRef` materialization)
- node param UI generation
- unsupported-WebGPU error behavior
- Node.js codec bridge

## Non-goals (Phase 4)

- No persisted GPU texture assets.
- No cross-process or cross-worker texture sharing.
- No user-authored shader nodes (separate plan).
- No attempt to expose every catalog module as a node immediately — start with the `published` subset.
- No HDR or wide-gamut pipeline (separate plan; SDR-first stays).

## Acceptance shape

Phase succeeds when:
1. A workflow can chain two or more shader nodes without intermediate readback and materialize a final `ImageRef`, in **both** browser and Node.js/Dawn.
2. At least one Node-side workflow that previously used `sharp` for a multi-op chain runs on the shared pool with byte-equivalent (or documented-difference) output.
3. The same `ShaderModule` objects are executed by sketch, timeline, and Node workflow runner — verified by import-graph analysis.

Example chain to prove first:

```text
Image In → HSB → Gaussian Blur → Vignette → Image Out
```

Prove in browser, then validate the same pipeline in Node.js/Dawn. Broad catalog coverage and full sharp parity come in follow-up work.

---

# Shared Shader Pool — Phase 5: Realtime and frame-loop hosts

**ID:** `P-2026-05-13-shared-shader-pool-phase-5-realtime`
**State:** draft
**Tags:** gpu, shaders, realtime, frame-loop, phase-5
**Repo:** default (`packages/gpu/`)

**Companion (orchestration + param store):** `__PLANS__/feat-realtime/PLAN-REALTIME-2.md` — workflow ↔ renderer bridge, runner third mode, `RealtimeLoop`, inference subprocess. Kept separate so this repo’s shader plan stays in `docs/` and evolves at a different cadence.

**Depends on:** Phase 1, Phase 2, Phase 3, Phase 4

**Scope (this document):** What the shared pool **must** provide so *any* realtime or frame-loop consumer — minimal webcam→FX→canvas, texture bus with async inference, feedback/trails, future NDI/Syphon — can plug in **without** forking WGSL or duplicating bind layouts. **Out of scope here:** session lifecycle, workflow vs realtime partitioning, param store, kernel runner "third mode", Python inference subprocess, zero-copy verification checklists — **see PLAN-REALTIME-2**. Phase 5 below is the **GPU catalog + executor contract** side; PLAN-REALTIME-2 is the **orchestration** side.

## Goal

Run the **same** `ShaderModule` catalog at frame rate inside a dedicated host (tick loop), not only in request/response workflow runs. The pool stays host-agnostic; the realtime host owns capture, scheduling, and when (if ever) CPU readback happens. Phase 5 ensures the foundation laid in Phases 1–4 is **sufficient** for that class of hosts — including optional feedback and sinks beyond `ImageRef`.

## What the pool guarantees (foundation for any realtime host)

- **Same artifacts as Phases 1–4:** `ShaderModule`, Executor, RecipeRunner, registry, variant resolution, `LabeledTexture`, `IOContract` (including `rod`), `TimeContract`, bucketed `ctx.scratch`, pipeline cache on `GPUContext`.
- **No implicit readback** — restated from Phase 1: the Executor never pulls pixels to CPU; hosts that need a CPU image do so explicitly (workflow boundary, `sample_frame`-style operations, inference input at model rate).
- **`texture_external` path** — Phase 3 variant + `color/convert/srgbExternalToLinear` (or equivalent registered module) so camera/video can enter the catalog as linear `texture_2d` in one submit.
- **Optional cross-frame state** — hosts that need trails, accumulation, or temporal effects use **`ctx.persistent`** (or equivalent): refcounted textures that survive across ticks, distinct from frame-scoped scratch. Simple realtime paths may use **only** scratch + ping-pong between two bucketed textures; persistent is for when feedback cannot be expressed as a single ping-pong pair.
- **`previousFrame` (or named prior-output) input** — optional graph concept: a source slot bound to **last tick's** output for a named handle. Keeps the per-tick graph a DAG while still allowing feedback; host advances the handle after submit. Catalog modules stay unchanged; wiring is host responsibility.

## What changes vs. Phase 4 (conceptual)

| Aspect | Phase 4 (texture FX chain) | Phase 5 (frame-loop host) |
|---|---|---|
| Execution model | Run-once, request/response | Continuous tick (source-driven or capped) |
| Texture lifetime | Per-run scratch + boundary `ImageRef` | Per-tick scratch **plus optional** `ctx.persistent` for feedback/state |
| Feedback | DAG only | `previousFrame` / named prior-output + optional persistent textures |
| Sources | `ImageRef` / `GPUTextureRef` | Same modules; **live** sources (webcam, file, later NDI/Syphon) enter via `texture_external` + convert pass, then identical FX |
| Outputs | `ImageRef` at boundaries | **Primary:** WebGPU canvas / surface the host owns. **Optional later:** NDI/Syphon/Spout as presentation sinks — not required for pool acceptance |
| Params | Workflow node inputs | Per-tick uniforms packed from snapshot (PLAN-REALTIME-2 param store → TypeGPU-backed `ShaderModule.params`) |
| Time | Static or keyframed | `time` / `frame` / `deltaTime` from host each tick |

## Ideas from the realtime draft worth preserving (host layer, not catalog)

These guide **PLAN-REALTIME-2**; the pool does not implement them, but should **not** contradict them:

- **Workflow context vs realtime context** — event-driven workflow vs continuous renderer loop; bridge via an explicit param/image channel (details in PLAN-REALTIME-2), not by pretending every graph edge is per-frame.
- **Workflow-driven control** — orchestration-only: serialized param pushes (`set_param`-style), not textures every frame over WebSocket. Realtime snapshots the param store once per tick → packs Executor uniforms against each node's TypeGPU schema. **`ImageRef`/bulk images occasional** (`set_image`-style); never implicit every-frame edges on the workflow DAG (see PLAN-REALTIME-2 "Graph boundary").
- **GPUExternalTexture lifetime** — import, convert to linear `texture_2d` in the same submission, never store the external handle across frames (aligns with Phase 3 module above).
- **FX path stays GPU** — display and multi-pass FX never force readback; heavy work (e.g. inference) may use **async nodes** at a lower rate with an explicit GPU→CPU step at that boundary only.
- **Capture abstraction** — webcam first; same FX pipeline when NDI/Syphon land (new sources, same downstream modules).

## Non-goals (Phase 5 in *this* shader-pool document)

- Specifying `RealtimeLoop`, param store API, `realtime_session_start` / server routing, or kernel third execution mode.
- Python subprocess, model loading, or StreamDiffusion-class pipelines (realtime plan + `nodetool-realtime`).
- Replacing sketch or timeline internal loops; they remain separate hosts that already benefit from the same catalog.
- User-authored shader nodes (still a separate plan).

## Acceptance shape (pool-side)

1. **Minimal —** `texture_external` (or uploaded `texture_2d`) → shared catalog module chain (e.g. HSB → blur) → canvas, at source frame rate, with **no** CPU read on the FX chain (Executor-only path).
2. **Feedback —** A graph using `previousFrame` and/or `ctx.persistent` runs for a sustained session without texture leaks.
3. **Reuse —** The same `ShaderModule` binaries (import graph) are used by sketch, timeline, Phase 4 workflow chains, and the Phase 5 frame-loop host.

Full end-to-end realtime acceptance (multi-platform zero-copy capture, async inference, workflow integration) is **gated on PLAN-REALTIME-2**, not on this document alone.

---

# Deferred ideas (revisit when triggered)

These were considered during plan review and intentionally left out. Each lists the trigger that should reopen it. **Do not design ahead of the trigger.**

- **RoI propagation upstream.** Trigger: first time a workflow re-cooks at full resolution because of a small upstream parameter change and a user complains, or first parameter-driven preview that needs region-limited re-render.
- **Tiled / scanline execution.** Trigger: first user hitting WebGPU max texture dimensions, or first VRAM OOM on a real workflow. Module declarations should grow a `tileSafe: boolean` field at that point.
- **Dynamic / imperative recipes** (`buildPasses(params, ctx) → Pass[]`). Trigger: first op that needs runtime-determined pass count — large-radius blur via mip pyramid, bloom with N downsample levels, iterative dilate/erode, conditional passes (tonemap `mode = none` as recipe-level passthrough).
- **WGSL hot reload.** Trigger: shader-author feedback that the Vite HMR + TS rebuild cycle is slowing iteration. Dev-only path that re-resolves WGSL and rebuilds the pipeline without rebuilding the module object.
- **Param expressions / driven values.** Trigger: first concrete request to drive a param from another node's output, an audio level, a curve, or MIDI/OSC. Belongs in the workflow graph, not the shader pool — but `params` may need to become `{ value, expression?, binding? }` per field.
- **`wantsMips` and derived resources.** Trigger: first module that needs a mip chain, gaussian pyramid, or summed-area table. vvvv's `WantsMips` is the model.
- **Structured `bindingKind`.** Trigger: variant count for any module exceeds ~3, or first module needing array textures, 3D textures, multi-sampled, or format-discriminated variants. Replace string enum with `{ dimension, sampleType, multisampled, viewDimension }` matching `GPUTextureBindingLayout`.
- **Format propagation rules.** Trigger: first time a module outputs different precision based on input precision (HDR-aware tonemap, float16 chains).
- **Multi-level cache (source-decode + graph-output).** Trigger: timeline preview of a multi-effect chain on a 4K clip drops frames, or per-keystroke param scrubbing re-cooks the whole chain. The cache key shape (Phase 1) is already specified for this.
- **Compute queue separation.** Trigger: realtime preview encoding starts blocking UI work, or export saturation is limited by interactive scheduling.
- **HDR / wide-gamut pipeline.** Trigger: first export target that requires it. Separate plan; SDR-first stays.
- **Pixel-identity tolerance.** Trigger: first flaky Phase 2 pixel-identity test. Decide then between byte-identical (current implicit assumption) and `max-diff < ε` (the honest version).
- **Per-input sampler binding clarification.** Trigger: first module that needs a different sampler for a mask input vs a color input in the same bind group.
