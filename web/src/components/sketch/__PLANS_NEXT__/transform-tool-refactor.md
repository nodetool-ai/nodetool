# transform-tool-refactor.md

Five steps. No new dependencies. Each step ships in one PR, leaves the tool working, and is verifiable by grep + tests.

## Why

Every recent bug (distort handles hang, gizmo out of sync, scale==distort, gizmo invisible until pan, stuck after one handle) maps to one of six structural defects:

1. `LayerTransform` is one stringly-typed struct with optional `matrix`/`quad`/`mode`/`scaleX/Y` — every consumer guesses which fields apply.
2. ~6 sources of truth for "current transform" (`layer.transform`, `session.currentTransform`, `originalTransform`, `dragStartTransform`, preview channel, multi-baselines).
3. ~8 overlapping "bounds" functions, none authoritative.
4. Per-mode logic scattered across 6 files; adding a mode = edit 6 files, miss one = silent bug.
5. Implicit state machine: 5 flags + 4 reset helpers copy-pasted across lifecycle methods.
6. Imperative gizmo canvas raced by React effects.

---

## Step 1 — Algebraic `LayerTransform` (1.5 days)

Replace the optional-everything struct with a discriminated union.

**Files (new / changed)**
- `types/document.ts` — define `LayerTransform = AffineTransform | QuadTransform`; remove optional `matrix`, `quad`, `mode` from base type.
- `types/transformNormalize.ts` (new) — `normalizeLayerTransform(legacy)` for JSON load + history restore (single migration boundary).
- `tools/transform/computeTransform.ts` — every `compute*Transform` returns the correct kind; remove fake `scaleX/rotation` paths.
- `rendering/canvas2d/composite.ts`, `rendering/canvas2d/reconcile.ts`, `rendering/webgpu/*` — `switch (t.kind)` instead of `if (t.mode === ...)`.
- `painting/resolvedLayerGeometry.ts`, `tools/transform/handleGeometry.ts`, `tools/transform/transformGizmoPainter.ts`, `tools/TransformTool.ts` — adapt.

**Commits**
1. Add new types + `normalizeLayerTransform`. Adapter functions to/from legacy. Tests for migration.
2. Switch internal modules one at a time (composite, reconcile, gizmo, tool, store) — each commit compiles.
3. Delete legacy fields and the adapter shim except at I/O boundary.

**Verify**
- `tsc` clean.
- `rg "transform\.mode"` → 0 hits in app code (allowed in `normalizeLayerTransform` only).
- `rg "isQuadTransformMode|isQuadOnlyTransform|usesAdvancedAffineTransform"` → 0 hits (replaced by `t.kind === "quad"`).
- All sketch tests green; new test: round-trip serialize → normalize → equal.

**Why first:** unlocks Steps 2–4 by making "what kind of transform am I looking at" a type fact instead of runtime guesswork.

---

## Step 2 — Single `getLayerGeometry()` (0.5 day)

One module, one return type, every consumer.

**Files**
- `painting/layerGeometry.ts` (new) — exports `getLayerGeometry(layer, canvas, doc): { rasterBounds, transformedCorners, transformedCenter, transformedExtents }`.
- Delete or make private: `getEffectiveRasterBounds`, `resolveGizmoBounds`, `getEffectiveLayerRasterBounds`, `getCanvasRasterBounds`, `getLayerRasterBounds`.
- Migrate call sites in: composite, reconcile, gizmo painter, hit-test, `TransformTool`, selection mask, snapping.

**Single internal rule for `rasterBounds`:**
1. `canvas.__nodetoolRasterBounds` if set.
2. Else opaque-pixel scan, cached on canvas.
3. Else `contentBounds`.
4. Else canvas size.

**Commits**
1. Add new module + tests covering all four fallback branches.
2. Migrate consumers in one commit per area (renderer, gizmo, tool, selection).
3. Delete the dead helpers.

**Verify**
- `rg "getEffectiveRasterBounds|resolveGizmoBounds|getEffectiveLayerRasterBounds|getCanvasRasterBounds|getLayerRasterBounds"` → 0 hits outside `layerGeometry.ts`.
- Existing transform consistency tests still pass; new test: gizmo bounds equal renderer bounds for a layer at every transform mode.

---

## Step 3 — Mode handler registry (0.5 day)

One file per mode implementing one interface.

**Files**
- `tools/transform/modes/types.ts` (new):
  ```ts
  interface TransformModeHandler {
    id: TransformModeId;
    label: string;
    visibleHandles: ReadonlyArray<TransformHandle>;
    supportsRotate: boolean;
    supportsPivot: boolean;
    rendersAsQuad: boolean;
    applyDrag(state: GestureState, pt: Point, mods: Modifiers): LayerTransform;
  }
  ```
- `tools/transform/modes/scale.ts`, `distort.ts`, `skew.ts`, `warp.ts`, `perspective.ts`, `perspectiveDual.ts` (new) — extract per-mode logic.
- `tools/transform/modes/registry.ts` (new) — `TRANSFORM_MODES: Record<TransformModeId, TransformModeHandler>`.
- Replace per-mode branches in: `composite.ts` (`handler.rendersAsQuad`), `reconcile.ts` (same), `transformGizmoPainter.ts` (`handler.visibleHandles`, `handler.supportsRotate`, `handler.supportsPivot`), `TransformTool.computeGestureTransform` (`handler.applyDrag`).
- Delete: `getVisibleHandles`, `isQuadOnlyTransform`, the per-mode if-cascade in `computeGestureTransform`.

**Commits**
1. Define interface + registry skeleton + extract one mode (`scale`) as the reference. Tests for the registry.
2. Extract remaining modes one per commit.
3. Replace consumers (composite, reconcile, painter, tool) — one commit each.
4. Delete dead helpers.

**Verify**
- `rg 'mode === "(scale|distort|skew|warp|perspective)"'` → 0 hits outside `modes/`.
- Adding a new mode requires touching exactly one new file + the registry.

---

## Step 4 — State machine in `TransformTool` (0.5 day)

Replace 5 implicit flags + 4 reset helpers with a discriminated union.

**Files**
- `tools/transform/toolState.ts` (new):
  ```ts
  type ToolState =
    | { phase: "inactive" }
    | { phase: "idle"; targets: TransformTargets }
    | { phase: "hovering"; targets; hovered: TransformHandle }
    | { phase: "dragging-handle"; targets; handle; mode; dragStart; dragStartTransform; dragStartCorners }
    | { phase: "dragging-pivot"; targets; dragStart; pivotAtStart };
  ```
- Pure transition functions: `onActivate(s) → s'`, `onPointerDown(s, e) → s'`, etc.
- `TransformTool.ts` becomes a thin shell holding the current state + dispatching pointer events to transitions.
- Delete `resetGestureState`, `resetPivotState`, `resetMultiGestureState`, `resetAdjustmentStacks`.

**Commits**
1. Add state type + transition functions with full unit tests (no DOM, just state in / state out).
2. Wire `TransformTool` to use them. Delete reset helpers.

**Verify**
- `TransformTool` has no `private` mutable fields except `private state: ToolState`.
- Unit tests cover every transition (pure functions = trivial to test).
- Integration test: drag handle, release, drag again — second drag works (kills "stuck after one handle").

---

## Step 5 — React-rendered gizmo (1 day)

Replace the imperative offscreen canvas with an SVG component on the same z-layer.

**Files**
- `tools/transform/TransformGizmo.tsx` (new) — pure component:
  ```tsx
  function TransformGizmo({ state, viewport }: Props) {
    if (state.phase === "inactive") return null;
    const handles = TRANSFORM_MODES[state.mode].visibleHandles;
    return (
      <svg className="gizmo-overlay" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
        <polygon points={cornersToPoints(corners, viewport)} className="gizmo-bbox" />
        {handles.map(h => (
          <rect key={h} {...handleRect(h, corners, viewport)}
                data-handle={h}
                style={{ pointerEvents: "auto", cursor: handleCursor(h) }} />
        ))}
        {handler.supportsRotate && <RotateRing ... />}
        {handler.supportsPivot && <PivotDot ... />}
      </svg>
    );
  }
  ```
- Mount inside the same container as the painting canvas, above the overlay canvas, below any toolbars. Same `position: absolute; inset: 0` as the gizmo canvas today.
- `TransformTool.onPointerDown` reads `event.target.dataset.handle` instead of calling `hitTestHandles`.
- Delete: `gizmoCanvasRef` and its sizing effect, `paintTransformGizmo`, `drawTransformGizmo`, `GizmoRedrawScheduler`, `hitTestHandles` (replaced by `data-handle`).

**Layering** (unchanged behavior, only tech swapped):
```
<div class="sketch-container">
  <canvas class="sketch-canvas" />     // painting
  <canvas class="overlay-canvas" />    // marching ants etc.
  <svg class="gizmo-overlay" />        // ← new home of the gizmo
</div>
```

**Commits**
1. Add `TransformGizmo.tsx` next to the existing canvas painter, behind a feature flag. Visual diff against the canvas version (screenshot test).
2. Switch `TransformTool` to read pointer hits from `data-handle`. Both renderers still work.
3. Remove the canvas painter, scheduler, hit-test math.

**Verify**
- `rg "gizmoCanvasRef|GizmoRedrawScheduler|paintTransformGizmo|hitTestHandles"` → 0 hits.
- Manual: switch to Transform tool — gizmo appears on the same frame, no pan needed.
- DPR: drag window between monitors — gizmo stays crisp without code changes.
- Cursor on hover changes per handle without `onMouseMove` math in the tool.

**Risk:** SVG pointer-events at extreme zoom. Mitigation: SVG root has `pointer-events: none`, only handle elements have `pointer-events: auto`. Empty gizmo space passes clicks through to the canvas below — same behavior as today, but without manual hit-test math.

---

## Optional Step 6 — Auto-bake on pointer-up (defer)

After every commit, reconcile baked pixels to identity transform. Kills "second drag composes on top of un-baked first quad". Cost: 10–30 ms re-raster per gesture for 4K layers; skip for trivial translate. Land after 1–5 are stable — it's a behavior change, not a structural one.

---

## Target folder structure

The five steps land files in their final home. No follow-up reshuffle.

```
web/src/components/sketch/
├── transform/                          ← NEW: self-contained transform subsystem
│   ├── types.ts                        (Step 1) discriminated LayerTransform
│   ├── normalize.ts                    (Step 1) legacy → canonical migration
│   ├── geometry/
│   │   ├── layerGeometry.ts            (Step 2) the only bounds/corners function
│   │   ├── handlePositions.ts          (from current handleGeometry.ts, pure math)
│   │   └── quadMath.ts                 (corners, intersections, projection helpers)
│   ├── modes/                          (Step 3) one file per mode
│   │   ├── types.ts                    TransformModeHandler interface
│   │   ├── registry.ts                 TRANSFORM_MODES registry
│   │   ├── scale.ts
│   │   ├── distort.ts
│   │   ├── skew.ts
│   │   ├── warp.ts
│   │   ├── perspective.ts
│   │   └── perspectiveDual.ts
│   ├── tool/
│   │   ├── TransformTool.ts            shell delegating to state machine
│   │   ├── toolState.ts                (Step 4) discriminated state union
│   │   ├── transitions.ts              pure (state, event) → state functions
│   │   ├── modifiers.ts                Shift/Ctrl/Alt → gesture intent
│   │   ├── autoSelect.ts               click-through opaque-pixel selection
│   │   └── multiTarget.ts              multi-layer baselines & application
│   ├── gizmo/                          (Step 5) React-rendered gizmo
│   │   ├── TransformGizmo.tsx          the SVG component
│   │   ├── HandleRect.tsx
│   │   ├── RotateRing.tsx
│   │   ├── PivotDot.tsx
│   │   └── styles.ts                   theme-driven styling
│   └── __tests__/                      transform-only tests
│
├── rendering/
│   ├── canvas2d/
│   │   ├── composite.ts                reads transform/types + modes/registry
│   │   ├── reconcile.ts                same
│   │   ├── quadTransform.ts            stays
│   │   └── layerIO.ts                  stays
│   ├── webgpu/                         (split out from rendering root)
│   │   ├── Runtime.ts                  (was WebGPURuntime.ts)
│   │   ├── shaders.ts
│   │   ├── init.ts
│   │   └── helpers.ts
│   └── Canvas2DRuntime.ts              stays at runtime root
│
├── painting/                           narrowed to actual painting
│   ├── engines/                        BrushEngine, PaintEngine, PencilEngine, EraserEngine, BlurEngine, CloneEngine
│   ├── sessions/                       PaintSession, HelperToolSession
│   ├── stabilizer/                     StabilizerBuffer, StrokeAssist
│   ├── alphaLock.ts
│   └── strokeRendering.ts
│
├── geometry/                           ← NEW: shared geometry primitives
│   ├── coords.ts                       (was painting/CoordinateMapper.ts)
│   ├── opaquePixelBounds.ts            (moved from painting/)
│   ├── layerBounds.ts                  (moved from painting/, narrowed)
│   └── sampleDocument.ts               (moved from painting/)
│
├── tools/                              non-transform tools
│   ├── BrushTool.ts, EraserTool.ts, MoveTool.ts, SelectionTool.ts, ...
│   └── shared/                         common tool helpers (no transform-specific code)
│
├── selection/                          stays
├── sam/                                stays
├── serialization/                      stays; calls transform/normalize at I/O boundary
├── state/                              stays
├── shortcuts/                          stays
├── editor-shell/, hooks/, sketchCanvasHooks/, tool-settings-panels/, Inspector/   stays
├── types/document.ts                   stays, but re-exports from transform/types.ts
└── SketchEditor.tsx etc.               stays at root
```

**Why this layout**

- `transform/` is a single self-contained subsystem. Adding a mode, fixing a bug, or swapping the gizmo renderer never touches more than one folder.
- `geometry/` holds coordinate math shared by selection, painting, transform — today these helpers live in `painting/` despite being tool-agnostic.
- `painting/` shrinks to just brush/eraser/blur/clone engines + sessions. Transform preview moves into `transform/`.
- `rendering/webgpu/` becomes a sibling of `canvas2d/` instead of mixed with it.
- `tools/` no longer has a sub-subsystem (`tools/transform/`). The transform tool becomes one entry point under `transform/tool/`.

**Migration mapping** (which step moves what)

| Step | Moves |
|---|---|
| 1 | `types/document.ts` → split: keep doc/layer types here; `LayerTransform` types go to `transform/types.ts`; `transform/normalize.ts` is new. |
| 2 | `painting/resolvedLayerGeometry.ts` + `painting/layerBounds.ts` + `painting/CoordinateMapper.ts` + `painting/sampleDocument.ts` + `painting/opaquePixelBounds.ts` → `geometry/` and `transform/geometry/layerGeometry.ts`. Old bounds helpers deleted. |
| 3 | `tools/transform/computeTransform.ts` → split into `transform/modes/*.ts` files + `transform/modes/registry.ts`. `tools/transform/handleGeometry.ts` → `transform/geometry/handlePositions.ts` (pure math; mode-specific visibility lives on the handler). |
| 4 | `tools/TransformTool.ts` → `transform/tool/TransformTool.ts`; new `transform/tool/toolState.ts`, `transitions.ts`, `modifiers.ts`, `autoSelect.ts`, `multiTarget.ts`. |
| 5 | `tools/transform/transformGizmoPainter.ts` + `tools/transform/cursorMapping.ts` + `tools/transform/transformHoverPolicy.ts` → deleted; replaced by `transform/gizmo/*.tsx`. `gizmoCanvasRef`, `GizmoRedrawScheduler`, `paintTransformGizmo`, `drawTransformGizmo`, `hitTestHandles` deleted. |

**Stays untouched**: `selection/`, `sam/`, `state/`, `shortcuts/`, `editor-shell/`, `Inspector/`, `tool-settings-panels/`, `serialization/` (only adds a call to `normalize` at I/O), and the root-level UI (`SketchEditor.tsx` etc.).

---

## Order & ground rules

Strictly 1 → 2 → 3 → 4 → 5. Each step:
- Compiles cleanly at the end. Tests are updated to the new structure (we do not preserve broken tests as a constraint).
- Lands files in their **final** folder (per the structure above) — no follow-up reshuffle.
- Net negative LoC (target totals: -200 / -150 / -100 / -200 / -300 ≈ **-950 LoC**).
- No new runtime dependencies. No Konva, no Pixi, no SVG library. Plain React + native SVG.
- Backwards compatibility is **not** a constraint. We're optimizing for the right architecture, not migration safety. Persisted documents go through `normalize` at I/O.

Recommend approving **Step 1** to start; I'll post the diff before merge.
