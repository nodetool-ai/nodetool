# Sketch Architecture Refactor Plan

> **Goal**: Clear, incremental path to an architecture that makes Phase 3–7 features
> easy to add without rewrites. Every phase leaves the app fully functional.
>
> **Last updated**: 2026-04-03

---

## Diagnosis: Current Pain Points

| File                           | Lines | Problem                                                                            |
| ------------------------------ | ----- | ---------------------------------------------------------------------------------- |
| `usePointerHandlers.ts`        | 2032  | All tool pointer logic inline; tools folder bypassed for select/move/gradient/crop |
| `state/useSketchStore.ts`      | 1479  | Document, viewport, tool settings, history, UI state all mixed                     |
| `types/index.ts`               | 1749  | Single giant file; tool settings, document format, util functions all together     |
| `rendering/Canvas2DRuntime.ts` | 1203  | No hooks for FX layer evaluation; compositing is a sealed loop                     |

The core issue is that **adding any new feature (FX layer, new tool, AI integration)
currently touches at least 3 of these 4 files**. The refactor removes that coupling.

---

## Cross-Cutting Guardrails

These rules apply to every phase so structural cleanup does not quietly regress
already-shipped editor behavior.

### Document / History / Tree Invariants

- The document model is already **tree-aware**, not a flat layer stack. Group layers,
  `parentId`, collapsed state, and descendant visibility semantics must survive every
  refactor untouched.
- Any new history shape must preserve **tree structure + sibling order**, not only flat
  layer ordering. Reorder, group, ungroup, nested visibility, and isolate/solo must
  undo/redo correctly.
- Persisted document format and in-memory/session history format are allowed to diverge.
  **Placeholder decision**: delta history is an internal runtime/session concern; saved
  sketch documents stay on the normal document schema and are not rewritten into a
  history-oriented format.

### Rendering Parity Rule

- Runtime compositing, thumbnails, flatten/export, isolate/solo preview, and future
  WebGPU output must all share one conceptual pipeline:
  `source raster -> transform -> effects -> blend`.
- A feature is not considered complete if it works only in the main canvas but not in
  thumbnails or export.
- **Placeholder decision**: Canvas2D remains the source-of-truth implementation first;
  WebGPU must match its behavior, not define new semantics.

### Serialization / Migration Rule

- Schema changes must come with explicit normalize-on-load behavior so older saved
  documents still open correctly.
- Optional new fields must always have a documented default when absent.
- **Placeholder decision**: `effects` missing on load means `[]`; `transform.matrix`
  missing on load means "derive authoritative matrix from decomposed values."

### Invalidation / Performance Rule

- Every phase must preserve the existing distinction between:
  overlay-only invalidation, transform-only invalidation, pixel/raster invalidation,
  and full composite invalidation.
- Do not introduce architectural changes that make pointer-up or ordinary brush strokes
  rebuild more state than they do today.
- The bar is user-visible responsiveness, not theoretical elegance.

### Async Tool Lifecycle Rule

- Long-running tools must have explicit semantics for commit, cancel, progress, and
  stale-result dropping.
- **Placeholder decision**: switching tools, changing documents, or starting a newer
  async commit cancels/invalidates the older pending result; only the latest valid
  commit may write to store/history.
- Successful async operations create exactly one history transaction on commit.
  Cancelled or stale operations create none.

### Testing / Verification Rule

- Tests may be added, removed, or relaxed during the refactor when that improves signal
  and keeps coverage focused on important behavior rather than obsolete structure.
- Do not preserve tests that only freeze internal file layout or implementation details.
- Do preserve or add focused coverage where regression risk is high: transformed layers,
  grouped layers, serialization/reload, export parity, selection semantics, and async
  tool lifecycle.

---

## Phase 1 — Foundation: Split the Monoliths

_No intentional behavior change. Low-value tests may be adjusted, but important
user-visible behavior must remain covered. Each item is independently mergeable._

### 1A — Store Split

Split `state/useSketchStore.ts` into focused slices. Keep a single re-exported
`useSketchStore` composed from slices so call sites don't change.

```
state/
  slices/
    documentSlice.ts     – layers[], canvas size, background; SketchDocument
    viewportSlice.ts     – zoom, pan, SKETCH_ZOOM_MIN/MAX
    toolSlice.ts         – activeTool, per-tool settings, fg/bg color,
                           symmetry mode/rays, pressureSettings, colorMode
    historySlice.ts      – history[], historyIndex, push/undo/redo
    selectionSlice.ts    – current Selection mask, combine mode, selection ops
    uiSlice.ts           – transientMoveModifierHeld, collapsedSections,
                           colorPickerOpen, any other ephemeral UI flags
  useSketchStore.ts      – composes slices, exports combined store + slice hooks
```

**Why each boundary matters:**

- `documentSlice` is the only one serialized; keeping it pure avoids accidental
  serialization of viewport or UI state.
- `toolSlice` will grow significantly when FX layer settings and new tools arrive;
  isolating it keeps the document model clean.
- `historySlice` owns undo/redo completely, enabling the delta history change in Phase 2
  without touching document or tool code.
- `selectionSlice` will need GPU-backed selection ops (Phase 3 WebGPU); isolation
  makes that swap clean.

**Store rule**: after the split, components should read through stable selectors and
slice-level helper hooks rather than broad subscriptions to the combined store. This is
a render/perf guardrail, not a purity goal.

### 1B — Types Split

Split `types/index.ts` into domain-scoped files; `types/index.ts` re-exports all.

```
types/
  document.ts    – SketchDocument, Layer, LayerTransform, LayerContentBounds,
                   BlendMode, SKETCH_FORMAT_VERSION, createDefault* factories
  tools.ts       – SketchTool union, all per-tool settings interfaces,
                   PenPressureSettings, StrokeAssistSettings, ShapeToolType, BrushType
  selection.ts   – Selection, SelectToolMode, SelectSettings
  geometry.ts    – Point, Size, Color, Rect (add Rect — currently absent and needed
                   for transform gizmo and FX clip bounds)
  history.ts     – HistoryEntry, LayerStructureSnapshot, PushHistoryOptions
  index.ts       – re-exports all of the above
```

Add `Rect` here; it's missing today and every non-trivial tool that works with
bounding boxes currently reconstructs it inline.

### 1C — Pointer Handler Decomposition

`usePointerHandlers.ts` has a `ToolHandler` interface in `tools/types.ts` and 16
tool files in `tools/` — but `handlePointerDown/Move/Up` still contain large
inline switch/if blocks that bypass it for select, move, gradient, and crop.

**Target state**: `usePointerHandlers.ts` becomes a thin dispatcher of ~200 lines:

- Pan and zoom handling (not tool-specific)
- Pressure normalization and coalesced events
- Modifier key state sync
- Delegate `onDown/onMove/onUp` to `getToolHandler(activeTool)`

Move all inline tool logic into the corresponding `tools/` files:

- `tools/SelectTool.ts` — absorbs marquee, lasso, wand, selection-move logic
- `tools/MoveTool.ts` — absorbs layer-move, auto-pick, spring-load logic
- `tools/GradientTool.ts` — absorbs gradient draw inline logic
- `tools/CropTool.ts` — absorbs crop inline logic

The `ToolContext` passed to tool handlers should be cleaned up to remove any canvas
refs or store hooks that individual tools don't use. Keep it to the minimum contract.

Also move `drawGradient` and `floodFill` out of `drawingUtils.ts` and into their
respective tool files during this phase — they're currently imported directly in
`usePointerHandlers.ts` and will become orphan exports once the inline logic moves.

**What this unlocks**: any new tool (AI inpaint, healing, vector shape) can be added
by creating a file in `tools/` and registering it — without touching `usePointerHandlers`.

### 1D — `drawingUtils.ts` Split

`drawingUtils.ts` is 1549 lines — a third monolith alongside the store and types.
It is not a utility file; it contains implementations for most painting operations.
Split by destination:

```
painting/
  strokeRendering.ts   – drawBrushStroke, drawPencilStroke, drawEraserStroke,
                         stampAlongStroke, StrokeStampState, pressure utils,
                         brushSettingsForEraserStroke, pencilSettingsForEraserStroke
  blurRendering.ts     – drawBlurStroke, blur scratch buffers, blur brush mask cache
  cloneRendering.ts    – drawCloneStampStroke, clone mask cache

rendering/
  canvasUtils.ts       – drawCheckerboard, drawPixelGrid, blendModeToComposite,
                         checkerboardDocumentCellPx, DirtyRectBox, DirtyRectTracker,
                         PIXEL_GRID_* constants, BlurTempCanvases

tools/
  GradientTool.ts      – drawGradient, constrainEnd, applyAltCenterDraw
  ShapeTool.ts         – drawShapeOnCtx
  FillTool.ts          – floodFill
```

`drawingUtils.ts` should be empty (or deleted) when 1C + 1D are complete.

### 1E — `toolDefinitions.ts` as a Thin Registry

After 1C, each tool file is self-contained — but `toolDefinitions.ts` still
centralizes tool metadata (icon, label, keyboard shortcut, settings schema). That
means "add a new tool = one file" is still false.

Each tool file should export a `definition` object:

```typescript
// tools/BrushTool.ts
export const definition: ToolDefinition = {
  id: "brush",
  label: "Brush",
  icon: PaintBrushIcon,
  shortcut: "B"
  // ...
};
```

`toolDefinitions.ts` becomes a registry that imports and assembles them:

```typescript
import { definition as brushDef } from "./BrushTool";
export const TOOL_DEFINITIONS = [brushDef, pencilDef /* ... */];
```

After this change, adding a new tool truly requires only one new file.

### 1F — `CoordinateMapper` as a Shared Utility

`CoordinateMapper` (77 lines) is currently instantiated inside `PaintSession`. Every
tool that does hit testing, gizmo rendering, or coordinate conversion needs the same
math. After 1C, self-contained tool files will reach for it directly.

Move it so it is accessible without going through `PaintSession`. It already takes
only `{ zoom, pan, layerTransform, contentBounds }` as inputs — it has no PaintSession
dependency internally. Either move it to `shared/CoordinateMapper.ts` or ensure it
is re-exported from `painting/index.ts` without requiring a session instance.

### 1G — Async Tool Pattern

The `ToolHandler` interface is synchronous. SAM segmentation already works around
this via a separate `useSegmentation` hook that lives outside the tool system. More
AI tools (inpaint, healing) will hit the same wall.

Define a small async extension on `ToolHandler`:

```typescript
// tools/types.ts
export interface ToolHandler {
  onDown(ctx: ToolContext, e: ToolPointerEvent): void;
  onMove(ctx: ToolContext, e: ToolPointerEvent): void;
  onUp(ctx: ToolContext, e: ToolPointerEvent): void;

  // Optional — async tools implement this instead of / alongside onUp
  onCommit?(ctx: ToolContext): Promise<void>;
  onCancel?(ctx: ToolContext): void;

  // Optional — for tools with long-running ops (progress 0–1, or null = indeterminate)
  getProgress?(ctx: ToolContext): number | null;
}
```

The dispatcher in `usePointerHandlers` calls `onCommit` after `onUp` if present,
catches errors, and exposes `getProgress` to the toolbar for a progress indicator.
`useSegmentation` is refactored to implement this interface so the segment tool
participates in the same lifecycle as everything else.

This is low-risk: synchronous tools ignore the optional methods entirely.

Lifecycle rules for async tools:

- ignore an `onCommit` result if the tool/document/session changed while work was pending
- tool switch or explicit cancel calls `onCancel` if present
- only successful current-session commits may write to store/history
- cancelled, superseded, or stale commits must not push history entries

---

## Phase 2 — Non-Destructive Pipeline Baseline

_Status: the first baseline is already landed. The document has an effects slot, the
runtime has an evaluation seam, and delta history is in place. The remaining work is
no longer "add the hook" — it is to replace the provisional schema/semantics with the
stronger contract described in Phase 3._

### 2A — Layer Effects Slot

Add to the `Layer` interface in `types/document.ts`:

```typescript
effects: LayerEffect[];
```

```typescript
// types/document.ts
export type LayerEffectType =
  | "brightness_contrast"
  | "hue_saturation"
  | "exposure"
  | "curves"
  | "tonemap"
  | "bloom";

export interface CurvePoint {
  x: number;
  y: number;
}

export interface BrightnessContrastEffect {
  type: "brightness_contrast";
  enabled: boolean;
  params: {
    brightness: number;
    contrast: number;
  };
}

export interface HueSaturationEffect {
  type: "hue_saturation";
  enabled: boolean;
  params: {
    hueDegrees: number;
    saturation: number;
    lightness: number;
  };
}

export interface ExposureEffect {
  type: "exposure";
  enabled: boolean;
  params: {
    exposureStops: number;
  };
}

export interface CurvesEffect {
  type: "curves";
  enabled: boolean;
  params: {
    rgb: CurvePoint[];
    red?: CurvePoint[];
    green?: CurvePoint[];
    blue?: CurvePoint[];
  };
}

export interface TonemapEffect {
  type: "tonemap";
  enabled: boolean;
  params: {
    operator: "aces" | "reinhard" | "filmic";
    exposureStops: number;
    whitePoint?: number;
  };
}

export interface BloomEffect {
  type: "bloom";
  enabled: boolean;
  params: {
    threshold: number;
    radius: number;
    intensity: number;
  };
}

export type LayerEffect =
  | BrightnessContrastEffect
  | HueSaturationEffect
  | ExposureEffect
  | CurvesEffect
  | TonemapEffect
  | BloomEffect;
```

Done in the current baseline:

- [x] Layers can carry an `effects` array.
- [x] The current implementation proved the document-level slot is viable.

Open follow-up work:

- [ ] Replace the provisional loose schema with a typed, discriminated effect model.
- [ ] Treat `effects: []` as the canonical empty value.
- [ ] Stop treating placeholder future effect names as enough architecture by themselves.

Backward compatibility is **not** a goal here. The refactor is allowed to make
`effects` required with `[]` as the normal empty value and to replace any temporary
`Record<string, number>` shape with the typed union above.

**Thumbnail note**: layer thumbnails currently come from raw raster data. Once FX
layers ship, thumbnails must come from the same resolved layer output as the main
canvas rather than reimplementing effect logic locally.

**Decisions for the first architecture slice:**

- Effects are attached to raster/mask layers only in the first implementation
- Group layers do **not** own FX yet; group-level FX is deferred until semantics are
  specified deliberately
- Child-layer effects evaluate before the layer is blended into its parent/group stack
- Export, merge-down, isolate preview, and thumbnails must apply the same per-layer
  effects as the main canvas
- Unsupported effect types must never silently no-op; unsupported evaluation is a bug
  and should fail loudly in development
- CSS filters may remain a temporary implementation detail for simple SDR adjustments,
  but they do **not** define the long-term semantics for curves, true exposure,
  tonemapping, bloom/glow, or any shader-backed effect math

### 2B — Compositing Evaluation Hook

In `Canvas2DRuntime` and `WebGPURuntime`, keep one shared seam between "raw layer
raster" and "blend into composite", but make it rich enough to support future
working-space / dynamic-range decisions:

```typescript
// rendering/types.ts
export interface ResolvedLayerBitmap {
  surface: HTMLCanvasElement;
  workingSpace: "srgb" | "linear-srgb";
  dynamicRange: "sdr" | "hdr";
}

export interface SketchRuntime {
  // ...existing API...
  evaluateLayerEffects(
    layerId: string,
    source: HTMLCanvasElement,
    effects: LayerEffect[]
  ): ResolvedLayerBitmap;
}
```

Done in the current baseline:

- [x] `evaluateLayerEffects` exists as a runtime seam.
- [x] The current implementation proved effects can be injected into the compositing path.

Open follow-up work:

- [ ] Turn this seam into the single source of truth for all visible output paths.
- [ ] Enrich the return contract so future working-space / dynamic-range choices are
  explicit rather than implied by a temporary backend.

The important constraint is not the current backend, but the contract:

- one effect-evaluation seam
- one resolved layer representation
- explicit working-space / dynamic-range metadata
- no duplicated effect logic across canvas, export, merge, thumbnails, or readback

This hook becomes the contract used by all output paths, not only the editor canvas:

- main compositing
- layer thumbnails
- flatten/export
- merge-down / bake operations that are meant to match visible output
- isolated/solo preview
- future WebGPU compositing

If an output path bypasses `evaluateLayerEffects`, it is a bug.

### 2C — Delta History

Current history stores full layer structure snapshots. For a document with 10 large
layers, each undo entry is expensive to encode and holds the full canvas set.

Change `HistoryEntry` to record only what changed:

```typescript
interface HistoryEntry {
  changedLayerIds: string[]; // which layers have snapshots
  layerSnapshots: Record<
    string,
    {
      // only changed layers
      data: string | null; // PNG data URL
      contentBounds: LayerContentBounds;
    }
  >;
  documentMeta: Omit<SketchDocument, "layers">; // canvas size, bg, etc.
  layerTree: Array<{ id: string; parentId: string | null }>; // tree + sibling order
  layerMeta: Record<string, Omit<Layer, "data" | "contentBounds">>;
}
```

Reconstruct a full `SketchDocument` at any history index by replaying from the
base snapshot (index 0) forward. For undo/redo within a session the canvases are
already in memory — the stored blobs are only for session recovery.

This makes history cheaper proportional to how many layers actually changed per
action (typically 1), rather than always proportional to total layer count.

Important constraints:

- history must preserve group nesting, sibling order, collapsed state, and parent changes
- transform-only actions should usually snapshot metadata only, not raster payloads
- pixel edits snapshot only changed rasters plus required metadata
- saved sketch documents remain ordinary document snapshots; delta history is not a new
  serialized document format

## (keep performance in mind so that after a brush stroke the mouse cursor does not jump)

## Phase 3 — WebGPU as the Primary Document Runtime

_This is not a greenfield WebGPU rewrite. A WebGPU path already exists and should now
be treated as the intended document renderer in Electron. Canvas2D remains acceptable
only for explicit helper paths where it is still the better tool: overlay/gizmo UI,
cursor previews, text rasterization helpers, and controlled readback/export helpers._

### Phase 3 Decisions

- WebGPU is the primary renderer for document pixels, not an opt-in experiment.
- Canvas2D is no longer described as the default fallback for the editor; it is a
  targeted helper backend used deliberately where correctness or simplicity wins.
- The current `SketchRuntime` seam is the starting point. Do not add public texture
  lifecycle methods unless implementation pressure proves the current interface is
  insufficient.
- Do not rewrite the existing brush engine just to make more code run on WebGPU.
  Brush feel is already good enough that Phase 3 should focus on compositing parity,
  FX integration, and runtime correctness first.
- Prefer small helper libraries that reduce WebGPU boilerplate or color/layout bugs
  without taking ownership of the render model. Engine-style scene graph libraries
  are out of scope for the sketch runtime.
- Future GPU-native brush work, selection compute, or more advanced paint simulation
  must build on this phase, not be bundled into it prematurely.

### Phase 3 Baseline Already Landed

- [x] The existing `WebGPURuntime.ts` / `initWebGPU.ts` path is the baseline
      implementation to improve, not a sketch to replace by default.
- [x] `SketchRuntime` already carries the right high-level seam:
      `invalidateLayer`, `compositeToDisplay`, `evaluateLayerEffects`, and
      readback/export helpers.
- [x] All 12 Photoshop-style blend modes are implemented on the WebGPU path via
      ping-pong compositing with a custom WGSL blend shader.
- [x] Transformed-layer support already exists on the WebGPU path through inverse affine
      mapping from screen pixels to layer texels.
- [x] Dirty-region behavior is already narrowed: the WebGPU path does full compositing,
      while partial redraw remains a Canvas2D optimization.
- [x] Device-loss / runtime re-init handling exists at a baseline level through the
      current `device.lost` callback flow in `createRuntime` / `useCompositing`.

### 3A — Compositing Parity and Runtime Hardening

- [ ] Audit the current `WebGPURuntime.ts` / `initWebGPU.ts` path and write down the
      specific parity gaps to fix first instead of restarting the runtime design.
- [ ] Resolve ordinary compositing mismatches on the WebGPU path: layer opacity,
      visibility, isolate/solo behavior, and blend-mode correctness.
- [ ] Fix transformed-layer parity so preview, commit, export, and history-backed
      redraws agree between the WebGPU and Canvas2D paths.
- [ ] Decide whether dirty-region redraw on WebGPU stays, is narrowed, or is replaced
      by explicit full redraws in known cases, then document and implement that choice.
- [ ] Implement device-loss / runtime re-init handling for Electron and cover the
      expected recovery behavior with a focused smoke/regression check.

### 3B — Readback, Sampling, and Output Consistency

- [ ] Centralize full-document readback so eyedropper, magic wand / selection sampling,
      clipboard/export helpers, and future thumbnail paths do not invent separate
      WebGPU-vs-Canvas2D rules.
- [ ] Route flatten/export, isolate preview, and the next thumbnail path through the
      same compositing/readback rules as the main canvas.
- [ ] Write down the approved Canvas2D helper paths for Phase 3
      (overlay/gizmo rendering, cursor/HUD presentation, text rasterization helpers,
      explicit CPU readback/export) and move any out-of-bounds usage onto the runtime
      plan or into deferred work.
- [ ] Run a focused stylus-responsiveness smoke check after each major Phase 3 slice and
      treat regressions in brush feel as blockers.

### 3C — FX Pipeline on the WebGPU Path

- [ ] Replace loose effect param bags with a discriminated union and make `effects`
      required (`[]` when empty) so future curves / tonemap / bloom work has a real
      schema instead of generic number maps.
- [ ] Route main canvas, flatten/export, merge-down, isolate preview, and thumbnail
      generation through one resolved-layer-output path so visible FX semantics are
      defined once.
- [ ] Remove silent no-op handling for unsupported effect types; unsupported evaluation
      should fail loudly in development and never become an invisible correctness hole.
- [ ] Treat the current CSS-filter-backed adjustment slice as temporary SDR plumbing,
      not as the long-term semantic definition of exposure, tonemap, curves, or bloom.
- [ ] Write and adopt explicit working-space / dynamic-range rules for CPU and GPU
      paths before expanding FX further: what is still SDR, when `linear-srgb` is used,
      and when HDR-capable intermediates (for example `rgba16float`) become required.
- [ ] Decide which simple adjustment effects may stay CPU-backed temporarily and which
      advanced effects must go straight to shader-backed implementation:
      curves, true exposure, tonemapping, bloom/glow, and any effect that depends on
      precise parity with future shader math should not be defined by CSS behavior.
- [ ] Add effect-result invalidation/caching hooks so repeated FX evaluation is tied to
      source raster changes and effect-param changes rather than recomputing blindly on
      every composite.

### 3D — Tooling and Dependency Boundaries

- [ ] Evaluate `webgpu-utils` as the first concrete helper dependency for runtime
      boilerplate reduction: shader-data definitions, structured views, buffer/texture
      setup helpers, and other low-level WebGPU utilities that do not hide pass
      boundaries or resource ownership.
- [ ] Evaluate `colorjs.io` as the first concrete color utility for explicit
      sRGB/linear conversions, blend-parity reference behavior, and future
      tonemapping/effect work that needs CPU and GPU paths to agree.
- [ ] If CPU↔WGSL uniform packing still duplicates field definitions or causes alignment
      bugs after trying `webgpu-utils`, choose one focused struct/layout helper or add a
      small internal layout layer and document that choice.
- [ ] Add the first small internal runtime wrappers needed by current Phase 3 work
      (for example `createFullscreenPass`, `createReadbackManager`, uniform/bind-group
      helpers, or texture pools) instead of spreading boilerplate across passes.
- [ ] Document `gl-matrix` as deferred until future lit/PBR brush work creates enough
      shared `mat3`/`mat4` lighting/material math to justify the dependency.
- [ ] Record `three.js` and `babylon.js` as explicit non-goals for the core sketch
      runtime in this phase so dependency decisions stay aligned during implementation.
- [ ] Restrict future lit/PBR brush preparation in Phase 3 to shared prerequisites that
      help the current runtime too: color/layout conventions, shader/buffer organization,
      and clean GPU pass boundaries.

### Explicitly Deferred from Phase 3

- Selection-mask compute remains a likely future GPU target, but it is not required to
  complete the first WebGPU-primary rendering slice.
- A fully GPU-native brush engine is deferred until parity, readback, and FX behavior
  are stable and profiling shows a real gain.
- More ambitious GPU paint simulation (smudge, wet mix, bristle dynamics) belongs in a
  later phase with its own latency and memory validation work.
- PBR/lit brush rendering is a future extension. It may justify stronger GPU math and
  material abstractions later, but it does not change the current Phase 3 goal of
  making the document runtime correct, consistent, and easy to extend.
- HDR display/output support, wide-gamut/professional imaging workflows, and import/export
  of higher dynamic range image data are future extensions. Phase 3 should avoid blocking
  them, but does not need to ship them.

---

## Phase 4 — Transform System

_Enables: transform tool completion, future text/vector layers, non-destructive scale._

### 4A — Matrix-Capable Layer Transforms

Current `LayerTransform` stores `{ x, y, scaleX?, scaleY?, rotation? }` as separate
fields. This is fine for translate-only and simple scale, but breaks for:

- Rotate-then-translate (order matters)
- Skew (needed for perspective)
- Compositing multiple transform operations

Add a `matrix` field alongside the decomposed values:

```typescript
export interface LayerTransform {
  // Decomposed (used for UI display, sliders, snap)
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  // Composed matrix (authoritative for rendering and hit testing)
  // DOMMatrix-compatible [a, b, c, d, e, f]
  matrix?: [number, number, number, number, number, number];
}
```

Rule: when `matrix` is present, it is authoritative. Decomposed fields are UI helpers.
Factories that construct `LayerTransform` from decomposed values compute `matrix`.
`CoordinateMapper` uses `matrix` when present.

**Placeholder decision**: first transform slice supports translate/scale/rotate with a
2D affine matrix only. Perspective/skew UI is deferred even if the matrix-capable model
could represent future extensions.

### 4B — Overlay Canvas for Tool Gizmos

before doing any of the following 4B items, check what may already exist.

The transform tool gizmo (handles, rotation arc, borders outside canvas) needs a
rendering layer that sits above the composited canvas but is separate from the
painting surface.

Extract a dedicated `overlayCanvas` from `useOverlayRenderer` — this already exists
as a concept but may be coupled to the selection marching ants. Make it a first-class
canvas that any tool can draw into during `onMove`/`onUp` without going through the
compositing pipeline.

This also resolves the reported blurriness of the transform gizmo (currently drawn
through the compositing path at document resolution, not screen resolution).

---

## Verification Gates

Each phase should keep the app shippable, but verification can stay selective and
practical rather than exhaustive.

Required checks should focus on what the phase can realistically break:

- Phase 1: pointer routing, tool behavior parity, store selector correctness, no obvious
  extra rerenders in hot paths
- Phase 2: save/load compatibility, thumbnail/export parity, history correctness,
  transform-only vs pixel-edit semantics
- Phase 3: WebGPU parity for blend modes, transformed layers, readback/export/isolate
  behavior, then performance wins
- Phase 4: hit testing, overlay sharpness, commit/cancel behavior, serialization of
  transformed layers

Tests may be removed or rewritten when they only encode old internals. Prefer a smaller,
high-signal regression suite over a larger set of brittle structural tests.

---

## Sequence & Dependencies

```
Phase 1A (store split)
Phase 1B (types split)     ← independent of 1A, can run in parallel
Phase 1C (pointer decomp)  ← depends on 1B (clean tool types needed)
Phase 1D (drawingUtils)    ← depends on 1C (tool files must exist to receive splits)
Phase 1E (tool registry)   ← depends on 1C (tool files must exist)
Phase 1F (CoordinateMapper)← independent, can run any time in Phase 1
Phase 1G (async tool)      ← depends on 1C (needs clean ToolHandler interface)
    ↓
Phase 2A (effects slot)    ← depends on 1B (document.ts needs to be stable)
Phase 2B (eval hook)       ← depends on 2A
Phase 2C (delta history)   ← depends on 1A (historySlice isolated)
    ↓
Phase 3  (WebGPU primary runtime) ← depends on 2B; must preserve shipped transform/
                                     overlay behavior from Phase 4
Phase 4  (transforms)      ← depends on 1B + 1C + 1F, independent of 2 and 3
```

---

## What Each Phase Unlocks

| Phase                    | Roadmap items directly enabled                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1A Store split           | Any feature that adds state (FX, new tools) without polluting document or history                                               |
| 1B Types split           | Faster iteration; import only what you need; onboard new tools faster                                                           |
| 1C Pointer decomp        | New tools (AI inpaint, healing, vector shape) = one file, no `usePointerHandlers` touch                                         |
| 1D drawingUtils          | Third monolith gone; painting, rendering, and tool concerns land in the right folders                                           |
| 1E Tool registry         | Adding a new tool = truly one file; `toolDefinitions.ts` stops being a mandatory touch                                          |
| 1F CoordinateMapper      | All tools share one coordinate model; transform tool + overlay gizmos work correctly                                            |
| 1G Async tool            | SAM segment tool in same lifecycle as all tools; future AI tools have a defined home                                            |
| 2A Effects slot          | FX layer panel can be built; format v3 migration path exists                                                                    |
| 2B Eval hook             | First FX layer (hue/sat/brightness) works; live adjustment previews without bake                                                |
| 2C Delta history         | History stays cheap as layer count grows; large-canvas editing stays fast                                                       |
| 3 WebGPU primary runtime | Electron rendering has one clear home; FX, readback, and parity work stop being split between "future GPU" and "current editor" |
| 4 Matrix transforms      | Transform tool completion; future text/vector layers; non-destructive scale                                                     |

---

## What This Plan Does NOT Include

- **Plugin/extensibility API** — not on the roadmap as a product feature. Internal
  modularity (Phase 1C) achieves the same developer ergonomics without the surface area.
- **Command pattern for history** — high-risk rewrite for uncertain gain. Delta history
  (2C) gives 80% of the memory benefit with much lower complexity.
- **Brush engine rewrite** — the current PaintSession + engine abstraction is solid.
  Extend it for smudge/color-smudge when the time comes; no structural change needed.
- **Event bus** — Zustand subscriptions handle cross-cutting notifications adequately.
  Not adding another messaging layer.

---

## Completion Status

| Phase                              | Status                                                 | Date       |
| ---------------------------------- | ------------------------------------------------------ | ---------- |
| 1A — Store Split                   | ✅ Done                                                | 2026-04-01 |
| 1B — Types Split                   | ✅ Done                                                | 2026-04-01 |
| 1C — Pointer Handler Decomposition | ✅ Done                                                | 2026-04-02 |
| 1D — `drawingUtils.ts` Split       | ✅ Done                                                | 2026-04-03 |
| 1E — Tool Registry                 | ✅ Done                                                | 2026-04-02 |
| 1F — CoordinateMapper              | ✅ Done                                                | 2026-04-02 |
| 1G — Async Tool Pattern            | ✅ Done                                                | 2026-04-02 |
| 2A — Layer Effects Slot            | ✅ Baseline landed; stronger typed schema remains in Phase 3 | 2026-04-02 |
| 2B — Compositing Evaluation Hook   | ✅ Baseline landed; resolved-output contract remains in Phase 3 | 2026-04-02 |
| 2C — Delta History                 | ✅ Done                                                | 2026-04-03 |
| 3 — WebGPU Primary Runtime         | In progress (baseline exists; parity/hardening remain) | —          |
| 4A — Matrix-Capable Transforms     | ✅ Done                                                | 2026-04-03 |
| 4B — Overlay Canvas for Gizmos     | ✅ Done                                                | 2026-04-03 |

### Phase 1D Notes

`drawingUtils.ts` is now a pure barrel re-export file. All implementations
live in their domain-specific modules:

- `drawGradient` → `tools/GradientTool.ts`
- `constrainEnd`, `applyAltCenterDraw`, `drawShapeOnCtx` → `tools/ShapeTool.ts`
- `floodFill` → `tools/FillTool.ts`
- Stroke rendering → `painting/strokeRendering.ts`
- Blur rendering → `painting/blurRendering.ts`
- Clone rendering → `painting/cloneRendering.ts`
- Canvas utilities → `rendering/canvasUtils.ts`

### Phase 2C Notes

Delta history stores raster data only for layers that changed since the
previous entry. The first entry is always a full baseline snapshot.

Key implementation details:

- `resolveLayerData(history, index, layerId)` walks backward to find data
- When the oldest entry is trimmed (MAX_HISTORY_SIZE), its data merges into
  the new oldest to maintain the baseline invariant
- `undo()`/`redo()` return resolved entries (all layer data) for canvas restoration
- `changedLayerIds` is optional on `HistoryEntry` for backward compatibility

### Phase 4A Notes

Matrix-capable transforms add an `AffineMatrix` type (`[a, b, c, d, e, f]`)
and a `matrix` field to `LayerTransform`. Key changes:

- `composeAffineMatrix(x, y, scaleX, scaleY, rotation)` builds the matrix
- `decomposeAffineMatrix(m)` extracts decomposed values (round-trips correctly)
- `ensureTransformMatrix(t)` computes matrix from decomposed values if absent
- `normalizeSketchDocument` computes matrix on load (schema migration)
- `CoordinateMapper` uses full inverse matrix for accurate doc↔layer mapping
- `Canvas2DRuntime.drawWithTransform` uses matrix when present
- `TransformTool.computeTransform` returns transforms with computed matrix
- `offsetLayerTransformInDocument` recomputes matrix on translate
- 22 new tests for compose/decompose round-trip and CoordinateMapper with matrix

### Phase 4B Notes

The gizmo canvas for tool overlays is now a first-class API available to any
tool, not just TransformTool. Key changes:

- `GizmoDrawCallback` type exported from `useOverlayRenderer` — receives the
  2D context, DPR, and container dimensions
- `clearGizmo()` and `drawGizmo(callback)` added to `UseOverlayRendererResult`,
  `ToolContext`, and wired through `usePointerHandlers` ↔ `SketchCanvas`
- `TransformTool` refactored to use `ctx.drawGizmo()` / `ctx.clearGizmo()`
  instead of direct `gizmoCanvasRef` manipulation — the canvas is now acquired,
  cleared, and reset to identity by the overlay renderer
- Removed `drawOverlayFallback` from TransformTool (dead code after gizmo canvas
  became always-available)
- Ad-hoc gizmo clearing in `useOverlayRenderer` replaced with `clearGizmo()` call
  — tools that need the gizmo redraw it in `onActivate`
- 2 new tests verifying TransformTool uses the new API
