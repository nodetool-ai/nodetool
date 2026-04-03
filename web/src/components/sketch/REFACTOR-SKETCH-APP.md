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

## Phase 2 — Non-Destructive Pipeline Scaffolding

_Enables: FX Layers (Phase 5), live adjustment previews, transform live preview._

### 2A — Layer Effects Slot

Add to the `Layer` interface in `types/document.ts`:

```typescript
effects?: LayerEffect[];
```

```typescript
// types/document.ts
export type LayerEffectType =
  | "hue_saturation"
  | "brightness_contrast"
  | "exposure"
  | "curves" // future
  | "tonemap"; // future

export interface LayerEffect {
  type: LayerEffectType;
  enabled: boolean;
  params: Record<string, number>; // typed per-effect when implementing
}
```

This is just the slot and schema. No evaluation logic yet. The serialization format
bumps to v3 with `effects` optional on each layer (backward-compatible: absent = []).

**Thumbnail note**: layer thumbnails currently come from raw raster data. Once FX
layers ship, thumbnails must come from the composited output (effects applied).
Flag this when implementing the FX panel — the thumbnail generation path in
`SketchLayersPanel` / `LayerItem` will need to call `evaluateLayerEffects` before
drawing the thumbnail canvas.

**Placeholder decisions for the first FX slice:**

- Effects are attached to raster/mask layers only in the first implementation
- Group layers do **not** own FX yet; group-level FX is deferred until semantics are
  specified deliberately
- Child-layer effects evaluate before the layer is blended into its parent/group stack
- Export and thumbnails must apply the same per-layer effects as the main canvas

### 2B — Compositing Evaluation Hook

In `Canvas2DRuntime` (and eventually `WebGPURuntime`), add a single evaluation
step between "draw raster" and "blend into composite":

```typescript
// rendering/types.ts
export interface SketchRuntime {
  // ...existing API...
  evaluateLayerEffects(
    layerId: string,
    source: HTMLCanvasElement,
    effects: LayerEffect[]
  ): HTMLCanvasElement; // returns source unchanged if effects is empty
}
```

Initial Canvas2D implementation is a pass-through. When FX layers are built, this
is the only place the implementation changes — no compositing loop restructuring.

This hook becomes the contract used by all output paths, not only the editor canvas:

- main compositing
- layer thumbnails
- flatten/export
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

## Phase 3 — WebGPU: Where It Actually Helps

_Not a rewrite. Opt-in runtime swap. Canvas2D stays as fallback._

### Assessment

| Operation               | Worth GPU?              | Reason                                                                                                                                                            |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Layer compositing**   | **Yes — highest value** | N layers × blend modes on every pointer move. GPU texture compositing with blend shaders is 5–10× faster for 10+ layers. Directly enables smooth FX layers.       |
| **FX layer evaluation** | **Yes — natural fit**   | Hue/sat/brightness/tonemapping as compute shaders; runs alongside compositing on already-uploaded textures. Design alongside FX layer implementation, not before. |
| **Selection mask ops**  | **Yes — medium value**  | Feather, expand, contract on large canvases are CPU-bound. WebGPU compute shaders solve this cleanly. Worth doing when adding lasso polish or magic wand tuning.  |
| **Brush engine**        | **No**                  | Brush stamps are small; the bottleneck is pointer event throughput, not GPU bandwidth. Canvas2D is fine here.                                                     |
| **Gradient rendering**  | **No**                  | Single-operation, not in the hot path.                                                                                                                            |

### Plan

1. **Extend the `SketchRuntime` interface** to include resource lifecycle:
   `uploadLayerTexture`, `invalidateLayerTexture`, `releaseLayerTexture`.
   Canvas2D no-ops these; WebGPU uses them to manage GPU-side layer textures.

2. **Implement WebGPU compositing** as an alternative `compositeToDisplay` path:
   - One texture per layer, uploaded lazily on first composite after invalidation
   - Blend mode shaders covering the 12 current modes (WGSL)
   - Opacity and visibility handled in the shader
   - Graceful fallback to Canvas2D if WebGPU unavailable or device lost

3. **Gate on a feature flag** (`useWebGPUCompositing` in `uiStore` or a build constant)
   so Canvas2D remains the default until WebGPU compositing is validated.

4. **Selection GPU compute** — add as a separate `SelectionRuntime` interface,
   not mixed into the compositing runtime. This keeps selection logic testable
   without a GPU context.

The existing `WebGPURuntime.ts` and `initWebGPU.ts` are Phase 1–2 sketches.
Review them for partly reuse but be willing to restart from the `SketchRuntime` interface
rather than extending the draft.

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

The transform tool gizmo (handles, rotation arc, borders outside canvas) needs a
rendering layer that sits above the composited canvas but is separate from the
painting surface.

Extract a dedicated `overlayCanvas` from `useOverlayRenderer` — this already exists
as a concept but is coupled to the selection marching ants. Make it a first-class
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
- Phase 3: visual parity with Canvas2D first, then performance wins
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
Phase 3  (WebGPU)          ← depends on 2B (runtime interface must have eval hook)
Phase 4  (transforms)      ← depends on 1B + 1C + 1F, independent of 2 and 3
```

---

## What Each Phase Unlocks

| Phase                | Roadmap items directly enabled                                                          |
| -------------------- | --------------------------------------------------------------------------------------- |
| 1A Store split       | Any feature that adds state (FX, new tools) without polluting document or history       |
| 1B Types split       | Faster iteration; import only what you need; onboard new tools faster                   |
| 1C Pointer decomp    | New tools (AI inpaint, healing, vector shape) = one file, no `usePointerHandlers` touch |
| 1D drawingUtils      | Third monolith gone; painting, rendering, and tool concerns land in the right folders   |
| 1E Tool registry     | Adding a new tool = truly one file; `toolDefinitions.ts` stops being a mandatory touch  |
| 1F CoordinateMapper  | All tools share one coordinate model; transform tool + overlay gizmos work correctly    |
| 1G Async tool        | SAM segment tool in same lifecycle as all tools; future AI tools have a defined home    |
| 2A Effects slot      | FX layer panel can be built; format v3 migration path exists                            |
| 2B Eval hook         | First FX layer (hue/sat/brightness) works; live adjustment previews without bake        |
| 2C Delta history     | History stays cheap as layer count grows; large-canvas editing stays fast               |
| 3 WebGPU compositing | 10+ layer documents stay responsive; FX layers don't tank frame rate                    |
| 4 Matrix transforms  | Transform tool completion; future text/vector layers; non-destructive scale             |

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

| Phase | Status | Date |
| ----- | ------ | ---- |
| 1A — Store Split | ✅ Done | 2026-04-01 |
| 1B — Types Split | ✅ Done | 2026-04-01 |
| 1C — Pointer Handler Decomposition | ✅ Done | 2026-04-02 |
| 1D — `drawingUtils.ts` Split | ✅ Done | 2026-04-03 |
| 1E — Tool Registry | ✅ Done | 2026-04-02 |
| 1F — CoordinateMapper | ✅ Done | 2026-04-02 |
| 1G — Async Tool Pattern | ✅ Done | 2026-04-02 |
| 2A — Layer Effects Slot | ✅ Done | 2026-04-02 |
| 2B — Compositing Evaluation Hook | ✅ Done | 2026-04-02 |
| 2C — Delta History | ✅ Done | 2026-04-03 |
| 3 — WebGPU Compositing | Not started | — |
| 4A — Matrix-Capable Transforms | Not started | — |
| 4B — Overlay Canvas for Gizmos | Not started | — |

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
