# Shared Shader Pool — Phase 1

**ID:** `P-2026-05-12-shared-shader-pool-phase-1`
**State:** draft
**Tags:** shader-pool, webgpu, typegpu, phase-1, sketch, timeline
**Repo:** default (`/home/claude/nodetool`)

Phase 1 of the Shared Shader Pool migration. Creates `web/src/lib/gpu/` as the shared home for WGSL source bundled with its typed bind group layout, typed uniform schema, sampler config, and I/O contract. No migration of existing sketch or timeline code yet — Phase 1 ships the *primitives* and one end-to-end canary that proves the pattern.

**Thesis:** Share things that have one correct answer regardless of consumer. Don't share things whose correctness depends on the consumer.
- Shared: WGSL + bind group layout + sampler config + typed uniform packer + I/O contract + small Executor.
- Host-owned: scheduling, texture lifetime, presentation, recipe execution policy (until proven worth sharing).

**Goal:** Establish the `ShaderModule` artifact, `LabeledTexture` wrapper, `GPUContext` adapter, and registry — all TypeGPU-backed — so later phases never re-derive uniform layouts or bind group layouts by hand.

**Direction:** Shared pool is a GPU operation catalog with a tiny runtime, not a universal renderer. The runtime covers single-pass texture-in/texture-out (and later multi-pass recipes); scheduling, lifetime, and presentation stay with each host.

## Key contracts

- **Atomic unit of reuse is `ShaderModule`**, not a `.wgsl` file. A module bundles WGSL + a TypeGPU bind group layout + sampler descriptor(s) + a TypeGPU `d.struct` uniform schema + a declared I/O contract. There is no way to import "just the WGSL."
- **Every texture in flight is a `LabeledTexture`** carrying `colorSpace`, `alpha`, `format`, `dimensions`, `bindingKind`. The Executor validates inputs against the module's declared I/O at bind time; mismatches fail loud or route through a registered conversion.
- **Host portability** via `GPUContext` adapter holding a `TgpuRoot` obtained from `tgpu.initFromDevice({ device })`. The same module code runs against browser `navigator.gpu`, Electron, and Node.js Dawn (`webgpu` npm package) devices.
- **Surface from day one:** `surface: "internal"` (free to churn) vs `surface: "published"` (frozen, additive-only, what workflow nodes are allowed to see in Phase 4). Promotion is a deliberate review, never a side effect of writing a shader.
- **Versioned IDs.** A module is `(id, version)`. Saved workflows pin a version; renames/splits ship as new versions, never in-place.
- **Color/alpha defaults are starting points, not global truths.** Modules declare per-input `colorSpace` and `alpha`; the Executor enforces.
- **Coordinates:** normalized UVs `[0,1]`, top-left origin, explicit output dimensions.
- **Registry uses explicit `ALL_SHADERS` barrel** (not `import.meta.glob`). Node-bundling-safe, grep-able, tree-shakeable.

## Dependency: TypeGPU

Adopted in Phase 1. The earlier plan deferred it; the critique made clear why that was wrong:
- Hand-written uniform packing across four hosts is the single highest-drift risk in the design. TypeGPU's `d.struct` schemas generate aligned/padded buffers automatically.
- Hand-rebuilt bind group layouts in each host are the second-highest risk. TypeGPU's typed layouts are the source of truth; `root.unwrap(layout)` returns the `GPUBindGroupLayout` that the WGSL was authored against.
- `tgpu.initFromDevice({ device })` accepts any `GPUDevice` — browser, Dawn, Electron — so the cross-runtime story is inherited rather than designed.
- WGSL stays hand-written; `tgpu.resolve(...)` connects it to the typed layout. The TS-to-WGSL compiler (`'use gpu'`) is not adopted.

## Phase 1 scope

1. Add `typegpu` dependency to `web/package.json`.
2. Create `web/src/lib/gpu/` with:
   - `module.ts` — `defineModule()` builder + `ShaderModule<P>` type
   - `texture.ts` — `LabeledTexture` wrapper + creation helpers
   - `context.ts` — `GPUContext` interface + default browser adapter using `navigator.gpu`
   - `registry.ts` — `register()`, `get({ id, version, surface })`, `list({ surface, category })`
   - `index.ts` — public barrel
3. One canary module at `shaders/_canary/passthrough/v1/module.ts` that copies an input texture to an output texture. Proves: TypeGPU schema → bind group → WGSL resolution → executor → labeled output, end-to-end, in one file.
4. Smoke test: from a Vitest file that creates a software-rasterizer `GPUDevice` (or skips if unavailable), run the canary against a 4×4 texture and assert pixel equality.

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
**Repo:** default (`/home/claude/nodetool`)

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

- Timeline compute shader source: `web/src/components/timeline/preview/gpu/shaders.ts`
- Timeline compute execution host: `web/src/components/timeline/preview/gpu/effectsProcessor.ts`
- Phase 1 shared pool: `web/src/lib/gpu/`

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
    dispatch?: { x: number; y: number; z?: number };
  }): void;
}
```

Single shared implementation. Steps per call: resolve variant (Phase 3 expands this), validate input labels against `module.io.inputs`, get-or-compile pipeline via `ctx.pipelineCache`, pack `params` via the module's TypeGPU schema, build the bind group from the module's typed layout, encode the compute dispatch. The host owns *when* to submit and *where* the output texture lives.

## ShaderModule shape after Phase 2

```ts
interface ShaderModule<P> {
  id: string;                                     // "color.grade"
  version: number;                                // 1
  surface: "internal" | "published";
  category: ShaderCategory;
  kind: "compute" | "vertex" | "fragment" | "snippet";

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

## Migration steps

1. Define `Executor` in `web/src/lib/gpu/executor.ts`. One implementation, shared.
2. Migrate each timeline shader to `web/src/lib/gpu/shaders/<category>/<id>/v1/module.ts` using `defineModule`. WGSL bodies move verbatim; bindings and the uniform struct are translated into TypeGPU schema/layout once.
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
**State:** draft
**Tags:** gpu, shaders, catalog, typegpu, recipes, phase-3
**Repo:** default (`/home/claude/nodetool`)

**Depends on:** Phase 1, Phase 2
**Scope:** Grow the catalog in reviewable batches, introduce `RecipeRunner` for multi-pass operations when Batch 4 needs it, formalize variant resolution against host capabilities, and start promoting stable modules to `surface: "published"`.

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

Filter/color/keyer/transform/mixer modules may declare an optional `mask` input in `io.inputs`. Missing mask = full coverage. The Executor enforces optional-input semantics. Timeline can ignore mask inputs until it has clip/track mask UI.

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
**Repo:** default (`/home/claude/nodetool`)

**Depends on:** Phase 1, Phase 2, Phase 3
**Scope:** Expose `published`-surface modules as workflow graph nodes that chain on the GPU, ship the Node.js Dawn `GPUContext` adapter, and migrate Node-side pixel operations off `sharp` onto the shared catalog.

## Goal

Two outcomes:
1. Workflow nodes generated from the shared catalog, chaining on GPU without intermediate readback, producing `ImageRef` only at workflow boundaries.
2. A single image pipeline shared between editor (sketch, timeline) and headless (Node.js workflow execution, Cloud Run, RunPod): same WGSL, same TypeGPU schemas, same Executor — different `GPUContext` adapters, different I/O codecs.

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
