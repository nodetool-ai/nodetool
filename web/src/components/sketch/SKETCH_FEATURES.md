# Sketch Editor Roadmap

> **Status**: transform-aware layer foundation and a WebGPU document-runtime baseline are in place, but transformed-layer move/transform correctness is not fully hardened yet; next work should stay focused on preview/commit parity, gizmo alignment, layer bounds, and output consistency before adding feature-heavy slices.
> **Last updated**: 2026-04-05
> **Execution note**: this file is the active roadmap/backlog. `REFACTOR-SKETCH-APP.md` is supporting implementation context; `REFACTOR-WEBGPU-TASKS.md` is no longer the active checklist.

## Principles

- keep code clean and modular with separation of concerns
- keep the document canvas fixed; off-canvas layer content must survive editing, history, and serialization
- prefer shared transform-aware infrastructure over ad hoc per-tool fixes
- treat WebGPU as the primary document renderer in Electron; keep Canvas 2D only for explicit helper paths where it is still the better tool
- keep ordinary raster workflows cheap and predictable
- only run sketch-related tests for normal iteration, not full app tests
- when changing shortcuts, edit src/components/sketch/SHORTCUTS.md
- **harden before extending**: make core models and helpers solid with regression tests before adding new features on top of them

Task labels used below:

- `[impl]` implementation task
- `[test]` test-only task
- `[impl+test]` implementation plus regression coverage
- `[test-first]` write the proving test first, then fix code if the test exposes a gap

## PHASE 1: Current Priorities

### 1.1 - Core groundwork before new feature slices

Guidance for Phase 1 work:

- each task should remove duplicated rules or hidden exceptions, not add a second temporary path beside the old one
- if a feature needs one-off transform math, sampling logic, export logic, or display exceptions, stop and move that missing contract back into Phase 1 first
- prefer one shared runtime/tool/session boundary over per-tool fixes in pointer handlers, tool modules, or export helpers
- move/transform gizmos, layer bounds overlays, and selection/marquee visuals must use the same resolved transformed extents as compositing; if alignment needs one-off math, move that missing contract back into Phase 1 first
- every Phase 1 slice should add focused regression coverage for transformed layers, preview/commit parity, or output consistency when relevant
- defer performance-only rewrites unless they remove architectural drift or unblock correctness
- if a task reveals a product decision instead of a cleanup need, move it to a later phase with a short note instead of solving it implicitly

Architectural direction for the remaining Phase 1 work:

- do not do a broad rewrite; prefer small contract-tightening slices in shared helpers
- if move, transform, compositing, hit testing, or overlays disagree, fix the shared geometry/preview/output seam instead of patching one tool
- separate three concepts more clearly where needed: raw stored layer pixels, resolved display/export surface, and resolved geometry used for bounds/hit testing/gizmos
- make sketch state-tier boundaries explicit where needed: stored document state, live runtime canvases, transient preview state, and resolved output should each have clear ownership and sync rules

Preferred "core engine" seams to strengthen instead of adding more tool-local logic:

- `painting/CoordinateMapper.ts` remains the single document<->layer coordinate contract; no tool should add its own transform math once a point enters document space
- `painting/resolvedLayerGeometry.ts` (new) or `painting/layerBounds.ts` (expanded) should become the single contract for effective raster bounds, composite offset, transformed document extents, and visual bounds/hit targets
- `painting/transformPreview.ts` (new) should own preview-transform merge/update rules so move and transform tools cannot drift
- `rendering/` should own resolved-output generation from raw layer canvas to effected/display/export/readback/thumbnail surface
- `hooks/useCanvasActions.ts` + `sketchCanvasHooks/useCompositing.ts` should be the only place where state-tier ownership/sync rules are coordinated; tools should signal intent, not invent sync rules

Boundaries for existing Phase 1 work:

- do not add new per-tool `getBounds` / `getExtents` / `getPreviewTransform` helpers if the same answer belongs in shared geometry or preview contracts
- do not let `MoveTool.ts`, `TransformTool.ts`, selection overlays, or hit testing each define their own notion of layer extents
- do not let thumbnail/export/readback code choose ad hoc between raw `layer.data`, layer canvas, and effected output; route that choice through one resolved-output seam
- when a task fixes one tool, require at least one cross-tool or shared-helper regression test if the bug was caused by contract drift rather than one isolated typo

Phase 1 "done means":

- coordinate mapping done means preview, commit, hit testing, overlays, and helper tools use the same transform contract
- preview/commit parity done means live preview, committed pixels, history replay, and export agree for the same transformed layer state
- gizmo/bounds alignment done means move and transform gizmos, selection/marquee overlays, and hit targets align with the same resolved document-space layer extents used for rendering
- document-output path done means readback/export/isolate no longer depend on display-only behavior such as checkerboards or canvas borders
- shared hard-tool integration done means fill/clone/blur/adjustments use the same runtime/session seams as the simpler paint tools
- sampling contract done means eyedropper/auto-pick/clone-stamp sampling agree on transformed layers, isolate state, and active stroke state

- [x] centralize document-space <-> layer-space coordinate mapping so preview, commit, hit testing, overlays, and helper tools all follow one transform contract
  - all paint tools use `CoordinateMapper`; move auto-pick now uses shared `hitTestLayerAtDocPoint` with `CoordinateMapper`; eyedropper uses shared `sampleCompositeColor` via `readbackComposite`
  - shared utilities in `painting/sampleDocument.ts`: `sampleCompositeColor`, `sampleCompositeRGBA`, `hitTestLayerAtDocPoint`
- [x] eliminate the remaining transformed-layer regressions and add focused regression coverage for move/nudge/draw/export/autosave roundtrips
  - regression tests in `__tests__/phase1TransformRegression.test.ts` and `__tests__/samplingContract.test.ts`
  - covers: move roundtrip, nudge accumulation, draw-after-move coordinate mapping, cross-tool consistency, affine transform roundtrips
- [ ] [impl+test] make active-layer preview and final commit obey the same transformed-layer semantics so live preview does not diverge from history/export results
  - audit note: current move preview/commit coverage is strongest for translation-only paths; moving a layer with existing scale/rotation/matrix state still needs explicit hardening
  - required follow-up: preserve the full existing `LayerTransform` during move preview and commit, then add regression coverage for move-after-scale/rotate and preview merge with existing transforms
- [ ] [impl+test] normalize transform preview ownership so move and transform preview use one contract for full-transform preservation and compositing
  - suggested seam: keep preview state ownership near `SketchCanvas.tsx` / `useCompositing.ts`, but route preview writes through one shared helper such as `painting/transformPreview.ts`
  - done means preview paths never replace a full transform with translation-only state, and preview rendering uses the same transform resolution rules as commit/history/export
  - boundary: `MoveTool.ts` and `TransformTool.ts` may request preview updates, but should not each define separate transform-merge semantics
- [ ] [impl+test] clarify and enforce sketch state boundaries so stored document state, live layer canvases, deferred sync state, transient preview state, and resolved output cannot silently drift
  - suggested seam: document the ownership rules close to `SketchCanvas.tsx`, `hooks/useCanvasActions.ts`, and `sketchCanvasHooks/useCompositing.ts`, then remove or centralize any remaining ambiguous sync paths
  - done means each editing flow has one clear source of truth at each stage (editing, preview, history snapshot, thumbnail sync, export/readback), and regression tests cover the boundary points where drift has already happened
  - boundary: tools should tell the system "start gesture", "update preview", "commit pixels/transform", or "end gesture", not decide thumbnail/export/history synchronization on their own
- [x] keep document-output rendering separate from display chrome and route readback/export/isolate through one resolved-output path; display-only checkerboard/border logic must never leak into sampling or export
  - fixed eyedropper: removed display canvas fast path that leaked checkerboard colors; now always uses `readbackComposite`
  - `renderDocumentCompositeToContext` excludes chrome; `compositeToDisplay` adds it; `flattenToDataUrl` and `readbackComposite` use the chrome-free path
- [ ] [impl+test] finish wiring `evaluateLayerEffects` / resolved-layer output through the remaining output paths so future thumbnails and helper flows stay consistent with the main canvas, export, isolate preview, and merge/downstream bake paths
  - note: effects already called in display and export via `renderDocumentCompositeToContext`; remaining gaps are curves/tonemap/bloom which need shader implementations (Phase 5 FX layer work)
  - suggested seam: make the resolved-output contract explicit in `rendering/` with one helper for "raw layer canvas -> resolved surface used for display/export/readback/thumbnails" so downstream code does not keep choosing between `layer.data` and effected runtime output ad hoc
  - boundary: layer-panel thumbnails and helper readback paths should consume the same resolved-output contract as display/export unless a raw-data exception is explicitly documented
- [ ] [impl+test] introduce one shared resolved-layer geometry helper so compositing, gizmos, overlays, and hit testing agree on transformed layer extents
  - suggested seam: add `painting/resolvedLayerGeometry.ts` (or expand `painting/layerBounds.ts` if that keeps the contract tighter) with one place to answer: effective raster bounds, composite offset, transformed document-space extents, and visual bounds for gizmos/hit targets
  - use this shared contract from move/transform gizmos, selection/marquee alignment code, compositing helpers, and any layer hit testing that currently recomputes bounds ad hoc
  - boundary: after this lands, tools and overlays should stop recomputing transformed layer extents locally except for trivial presentation-only offsets
- [x] route flood fill, clone stamp, blur, and adjustments through shared session boundaries even when their internal implementation stays CPU-backed
  - all use `CoordinateMapper` for coordinate mapping and `onStrokeStart`/`onStrokeEnd` for lifecycle
  - extracted shared `painting/alphaLock.ts` (`captureAlphaSnapshot`, `restoreAlphaFromSnapshot`) used by CloneStamp and Blur
- [x] rework eyedropper, move auto-pick, clone-stamp sampling, and other readback helpers so transformed layers and isolate state use one sampling contract
  - eyedropper: uses `sampleCompositeColor` (via `readbackComposite`, no display chrome)
  - move auto-pick: uses `hitTestLayerAtDocPoint` (via `CoordinateMapper`, affine-transform-aware)
  - clone-stamp: already uses `CoordinateMapper` for both source and destination mapping
  - 22 regression tests in `__tests__/samplingContract.test.ts`
- [x] remove the remaining implicit legacy-runtime behavior from normal editing flow and replace it with explicit documented exceptions
  - removed eyedropper display canvas fast path (was the only implicit fallback that leaked display chrome into tool behavior)
  - WebGPU→Canvas2D delegation for effects is intentional and documented (not legacy behavior)
- [x] keep running focused stylus / paint-after-move / preview-correctness smoke checks after each major runtime slice and treat regressions in brush feel as blockers
  - 13 regression tests in `__tests__/phase1TransformRegression.test.ts` covering paint-after-move, sequential transforms, preview/commit parity
  - 8 alpha-lock tests in `__tests__/alphaLock.test.ts`

### 1.2 - Fixes

- [x] Improve selection: rectangle clips at canvas bounds (correct), ellipse/lasso/polygon already extend beyond canvas (verified, no change needed)
- [ ] [impl+test] Improve move tool: preserve existing scale/rotation/matrix during preview + commit on transformed layers; current move path is not fully correct beyond translation-only cases
- [ ] [impl+test] Improve move/transform bounds visuals: move gizmo, scale gizmo, and selection/marquee overlays are currently not aligned to the layer correctly; they must use the same resolved transformed bounds as compositing and hit testing
  - this task should consume the shared resolved-layer geometry helper above, not add more one-off gizmo math inside `MoveTool.ts` or `TransformTool.ts`
- [x] Improve brush-setting responsiveness so size/hardness changes update without visible UI or cursor lag — cursor now redraws immediately when settings change via useEffect on drawCursor callback
- [x] fix Fill tool: expanded layer canvas to full document viewport before flood fill so compact contentBounds layers no longer leave unfilled borders
- [x] Crop tool: add ESC key to cancel current cropping — onCancel wired through cancelActiveTool chain
- [x] Move tool: gizmo now uses actual layer canvas dimensions instead of only contentBounds; gizmo already hidden on tool deactivation (verified)
  - note: this fixes the raster-footprint source for the off-canvas outline, but does not yet mean move/scale gizmos are aligned correctly for transformed layers
- [x] fix Layer preview: new transparent layer shows black preview. after drawing preview shows up correct with alpha grid
- [x] all tooltips: add centralised setting for tooltip delay and set to 500ms
- [x] Sketch node: input handles closer together, same spacing as output handles
- [x] Gradient Tool: should respect current selection, not draw outside

### 1.3 - Harden layer canvas lifecycle

The layer canvas is the central data structure — every tool reads and writes it, compositing displays it, history snapshots it, export serializes it. Making this lifecycle rock-solid prevents cascading bugs in every feature above.

Architecture note: `layerCanvasesRef.current` (React ref Map) and `Canvas2DRuntime.layerCanvases` (internal Map) share the **same Map reference** (established at construction in `useCompositing.ts:114`). `ensureLayerRasterBounds` writes to `layerCanvasesRef.current` which also updates the runtime's map. `getOrCreateLayerCanvas` in the runtime only creates when no canvas exists — it never downsizes an expanded canvas.

- [x] add dedicated test suite for `layerBounds.ts`: cover `ensureLayerRasterBounds` (expansion, no-op when already large enough, content preservation after expansion), `getEffectiveLayerRasterBounds` (canvas metadata priority, fallback to contentBounds, fallback to canvas dimensions), `unionLayerBounds` (disjoint, overlapping, contained), `getDocumentViewportLayerBounds` (with and without layer transform offset)
- [x] add tests for layer canvas lifecycle across operations: create layer → draw → move → draw again → undo → redo; verify canvas dimensions and raster bounds metadata stay consistent at each step
- [x] add tests for `getOrCreateLayerCanvas` sizing decision chain: verify that `layer.contentBounds` takes priority, then stable raster size cache, then existing canvas, then document size fallback; verify that once a canvas is expanded it is not shrunk by a subsequent `getOrCreateLayerCanvas` call
- [ ] [test-first] verify that `drainPendingStrokeCommit` runs before every operation that reads layer pixel data (history push, export, flatten, merge); replace the current smoke coverage with a real pending-stroke integration test that exercises the deferred commit path
- [x] audit all callers of `ensureLayerRasterBounds` (PaintSession, FillTool, ShapeTool, GradientTool, usePointerHandlerUtils) and verify each one uses the returned expanded bounds for CoordinateMapper, not the stale `layer.contentBounds`

### 1.4 - Harden coordinate mapping

`CoordinateMapper` is the single source of truth for document↔layer coordinate conversion. Every tool that places pixels, samples colors, or hit-tests selections must use it consistently. Current audit shows all paint tools use `CoordinateMapper` with `getEffectiveLayerRasterBounds` — but there is no regression coverage that enforces this stays true.

- [x] add dedicated regression tests for `CoordinateMapper`: verify `docToLayer` / `layerToDoc` round-trip identity for translation-only, scale+rotation, and full affine transforms; verify that `offset` getter matches `docToLayer({0,0})` negation; verify singular matrix fallback returns identity
- [x] add a cross-tool coordinate consistency test: for a layer with a non-trivial transform (e.g. translated + rotated), verify that PaintSession, FillTool, CloneStampTool, GradientTool, BlurTool, and ShapeTool all produce the same `docToLayer` result for the same document-space point — this catches any tool that constructs CoordinateMapper with different config
- [x] verify that overlay preview drawing (selection outlines, shape preview, gradient preview) uses the same coordinate mapping as the committed pixels — a preview drawn at screen position X should result in committed pixels at the same X after commit
- [x] verify that `dirtyToDoc` rect conversion is consistent with the compositing offset used by `getLayerCompositeOffset` — dirty-region redraws should exactly cover the area that changed
- [ ] [test] add regression coverage for move/transform gizmo alignment: for translated, scaled, and rotated layers, verify gizmo bounds/handles use the same resolved document-space extents as compositing and hit testing

### 1.5 - Harden selection model

The selection system (`Selection` type, mask creation, hit testing, constraint application) is used by every tool that respects selections. The mask creation functions are well-separated by mode, but the combination and constraint paths lack dedicated tests.

- [x] add dedicated tests for `selectionHitTest`: verify correct results at selection boundary pixels, outside selection, at `originX/originY` offset, and with non-zero origin
- [x] add dedicated tests for `combineMasks` in all four modes: replace, add (union), subtract, intersect; verify that combine result matches expected mask data for overlapping and non-overlapping inputs
- [ ] [impl+test] add tests for `applySelectionConstraint`: verify this against shared production logic rather than only conceptual/inlined test logic so fill/gradient selection clipping cannot drift
  - suggested seam: if current selection constraint behavior is duplicated/private inside tool modules, extract a shared helper under `selection/` or `painting/` and test that production helper directly
- [x] add tests for `selectionHasAnyPixels`: verify correct results for empty mask (all zeros), mask with a single selected pixel, and fully selected mask
- [x] verify that selection `originX/originY` is handled consistently: when a selection is created at a non-zero document offset (e.g. ellipse at x=50,y=50), verify that `selectionHitTest`, `applySelectionConstraint`, and paint clipping all account for the origin correctly
- [ ] [test] verify that each selection mode (rectangle, ellipse, lasso, polygon, magic wand) produces a mask with correct `width`, `height`, and `originX/originY` values relative to the document canvas; current coverage is strongest for rectangle/ellipse/core mask ops and needs explicit lasso/magic-wand follow-up

### 1.6 - Harden compositing and rendering

The compositing pipeline (`renderDocumentCompositeToContext`) is the single path for both display and export. The per-layer compositing involves offset calculation, transform application, effects evaluation, and active stroke blending. Making this path trustworthy means display and export always agree.

- [ ] [test] add test that verifies display compositing and `flattenToDataUrl` produce identical pixel output for the same document state (ignoring checkerboard background) — use real pixel equivalence, not only structural/mock coverage
- [x] add test that a layer with `contentBounds` offset at `(50, 50)` and transform at `(-10, -10)` composites at the correct document position (expected: top-left at `(40, 40)`) — this exercises the `getLayerCompositeOffset` + `drawWithTransform` pipeline
- [x] add test that the active stroke buffer composites at the correct opacity and blend mode during display, and that after commit, the committed layer matches the preview
- [x] add test that `getMaskDataUrl` returns only the mask layer content (not other layers) and respects the mask layer's transform and contentBounds offset
- [ ] [test] add test that layer effects (`evaluateLayerEffects`) are applied during both display compositing and export — not just one path
- [ ] [test] verify that `readbackComposite` (used by eyedropper and magic wand) samples the same pixels as the display shows, including layer transforms and effects

### 1.7 - Harden transform model

The transform model (`LayerTransform` with affine matrix) underpins move, transform tool, and coordinate mapping. The composition/decomposition round-trip and the reconciliation path need to be bulletproof.

- [x] add test that `composeAffineMatrix` → `decomposeAffineMatrix` round-trips correctly for: identity, pure translation, pure rotation, pure scale, non-uniform scale, combined TRS, negative scale (flip)
- [x] add test that `reconcileLayerToDocumentSpace` correctly bakes a translated+rotated layer into a document-sized canvas with identity transform — verify pixel data lands at the expected document coordinates
- [x] add test that `reconcileLayerToDocumentSpace` preserves transparency and does not introduce edge artifacts (e.g. anti-aliasing at canvas edges when blitting rotated content)
- [x] add test that after transform tool commit (which calls `reconcileLayerToDocumentSpace`), the undo entry correctly restores both the original canvas data AND the original transform values
- [x] add test that `ensureTransformMatrix` fills in a correct matrix when called on a transform with only `x/y` (no matrix field) — and that CoordinateMapper handles both cases identically

### 1.8 - Harden history and serialization

The delta history system is the safety net for all editing. History entries capture canvas snapshots and layer structure; serialization persists documents across sessions. Both must faithfully represent the document state including contentBounds and transforms.

- [x] add test for history delta correctness: push three history entries where only one layer changes each time; verify that `resolveLayerData` reconstructs the correct data for each layer at each history position
- [x] add test that undo after a bounds-expanding stroke restores the original (smaller) canvas dimensions and contentBounds — not the expanded ones
- [x] add test that redo after undo replays the stroke correctly, including the bounds expansion
- [ ] [test] add test for `serializeLayerData` / `deserializeLayerData` round-trip: verify helper-level bounds metadata and pixel data survive encode → decode; document-level serialization coverage is not enough on its own
- [x] add test that document serialization → deserialization preserves all layer contentBounds, transforms, effects, and pixel data — verify by comparing a freshly created document with one that has been serialized and deserialized

### 1.9 - Active feature work

- [ ] [impl+test] finish transform tool UX on top of the matrix-capable transform model: keep live preview correct, keep commit/cancel reliable, make move/scale gizmos align with the actual transformed layer, and fix left/top handle scaling so it does not behave like right/bottom scaling
- [x] fix layer visibility: layers not visible when opening editor until using a drawing tool, toggling layers does not always work, setting mask layer not always working correctly
- [x] fix brush strokes not visible when holding shift for straight lines - they only appear after releasing shift key. also all layers become invisible during drawing of straight lines

### 1.10 - Targeted refactor phase for overloaded files

These are not "clean up for its own sake" tasks. They are explicit support work for the shared geometry / preview / output / state-boundary contracts above. Do them when touching the related seams; avoid a separate broad rewrite branch.

- [ ] [impl+test] split `hooks/useCanvasActions.ts` by responsibility so gesture lifecycle, transform actions, export/output sync, and canvas-geometry actions stop competing in one file
  - suggested split: `useStrokeLifecycleActions.ts`, `useTransformActions.ts`, `useExportSyncActions.ts`, `useCanvasGeometryActions.ts`
  - keep the boundary clear: this layer coordinates ownership/sync rules, but tool modules should still express intent rather than embedding sync policy
- [ ] [impl+test] break up `sketchCanvasHooks/useCompositing.ts` so runtime bootstrapping, layer hydration, redraw scheduling, transform preview compositing, and pending-stroke draining are isolated behind smaller helpers
  - suggested split: `useRuntimeBootstrap.ts`, `useLayerHydration.ts`, `useRedrawScheduler.ts`, `useTransformPreviewComposite.ts`
  - keep this hook as the orchestrator, not the permanent home for every compositing concern
- [ ] [impl+test] decompose `rendering/Canvas2DRuntime.ts` into internal engine modules so serialization/readback, resolved-output/effects, compositing, transform reconciliation, and mask/export helpers have clearer boundaries
  - suggested split under `rendering/canvas2d/`: `layerIO.ts`, `resolvedOutput.ts`, `composite.ts`, `reconcile.ts`, `maskAndExport.ts`
  - do not over-split public APIs early; prefer extracting cohesive internal modules first while keeping the runtime facade stable
- [ ] [impl+test] extract pure transform/gizmo math out of `tools/TransformTool.ts` so the tool file becomes interaction orchestration over shared geometry helpers instead of a second geometry engine
  - suggested split: `tools/transform/handleGeometry.ts`, `tools/transform/computeTransform.ts`, `tools/transform/cursorMapping.ts`
  - after this, `TransformTool.ts` should mostly own hit flow, drag state, and calls into shared contracts
- [ ] [impl+test] simplify `tools/MoveTool.ts` once shared preview and resolved-geometry helpers exist so move interaction stops owning its own transform-merge and gizmo semantics
  - boundary: move should request preview updates and geometry queries from shared helpers rather than defining transform preservation locally
- [ ] [impl+test] watch `sketchCanvasHooks/usePointerHandlers.ts` for router creep; extract any new shared hover / gesture / tool-routing policy before it becomes another mixed-responsibility policy file
  - only keep pointer-event routing and tool dispatch here; preview semantics, geometry rules, and sync decisions belong in their dedicated seams

## PHASE 2 - FIXES

- [ ] fix small delay when starting brush strokes - mouse cursor hangs for 50ms right after starting a stroke
- [ ] rethink layer action buttons: sort, think about what should be in top and bottom groups, remove icons for crop canvas, but leave in context menu

## 2.1 - FEATURES

## PHASE 2.2: Transform Tool features and shortcuts

before starting these tasks, finish the Phase 1 groundwork items that affect transform semantics, preview/commit parity, and helper-tool sampling.
avoid workarounds and spread out implementation; if a transform feature needs one-off math or display-path exceptions, move that missing foundation back into Phase 1 first.

- [ ] Transform tool should keep the updated layer preview correct while scaling, moving, and future advanced transform modes; preview behavior must not diverge from commit/history/export
- [ ] Transform tool gizmo should adapt to layer size, so if layer is smaller than canvas the gizmo should be small
- [ ] Transform tool: fix transforming from top and left side, currently scales from opposite side
- [ ] Transform tool: add options for perspective, skew, etc.
- [ ] Transform tool: Commit, cancel, reset as icons instead of text buttons
- [ ] Modifier Keys:
      The modifier logic for transform tool should follow a consistent pattern:

No modifier → Scale (default)
Ctrl (Cmd) → "Break free" — independent vertex control (Distort on corners, Skew on edges)
Shift → Constrain (proportional scale, 15° rotation snap, axis-lock distortion)
Alt (Option) → From center / symmetrical
Ctrl+Shift → Skew on sides, constrained distort on corners
Ctrl+Alt+Shift → Perspective (all three modifiers = maximum control)
Cursor position determines behavior (outside box = rotate, inside = move, on handle = transform)

support most / all of the following features and shortcuts and check off done items:

Activating & Committing

Ctrl+T (Cmd+T) — Enter Free Transform
Enter (Return) — Commit the transformation
Esc — Cancel the transformation
Ctrl+Z (Cmd+Z) — Undo the last handle adjustment while still in transform mode
Right-click inside the bounding box — Context menu with all transform modes (Skew, Distort, Perspective, Warp, Rotate 180°, 90° CW/CCW, Flip H/V)

- Scale
  Action, Shortcut
  Scale freely (non-proportional) Drag any handle (if Link icon is ON, this scales proportionally)Toggle proportional/non-proportionalHold Shift while dragging a corner handle (toggles the Link icon state)Scale from centerHold Alt (Option) while dragging any handleScale proportionally from centerHold Shift+Alt (Shift+Option) while dragging a corner handleScale width onlyDrag a left or right side handleScale height onlyDrag a top or bottom side handle
  Rotate
  Action, Shortcut
  Free rotate Move cursor outside bounding box (curved arrow appears), dragRotate in 15° snapped incrementsHold Shift while rotatingChange rotation pivot pointDrag the reference point (center target), or click a square on the reference point locator in the Options bar
- Distort (move one corner independently)
  Action, Shortcut
  Distort freely — move a single corner handle independently in any direction
  Hold Ctrl (Cmd) + drag a corner handleDistort constrained to horizontal or verticalHold Ctrl+Shift (Cmd+Shift) + drag a corner handleDistort from center — move a corner while the diagonally opposite corner moves in the opposite direction
  Hold Ctrl+Alt (Cmd+Option) + drag a corner handle
- Skew
  Action, Shortcut
  Skew — slide a side edge to slant the image
  Hold Ctrl+Shift (Cmd+Shift) + drag a side handleSkew via side handle (simpler shortcut) Hold Ctrl (Cmd) + drag a side handleSkew opposite sides simultaneously
  Hold Alt (Option) while skewing (adds symmetry)
  Important nuance: Ctrl+drag on a side handle = Skew. Ctrl+drag on a corner handle = Distort. Same modifier key, different handle determines the behavior.
- Perspective
  Action, Shortcut
  Perspective — drag a corner and the opposite corner moves symmetrically in the opposite direction
  Hold Ctrl+Alt+Shift (Cmd+Option+Shift) + drag a corner handle
  This creates the classic converging/diverging vanishing point effect. Dragging a corner inward pushes the opposite corner inward too; dragging outward pushes the other outward.
- Warp
  Action, Shortcut
  Enter Warp mode Click the Warp toggle icon in the Options bar, or right-click → WarpDrag warp gridClick and drag any grid intersection, control point, or areaToggle Bézier handles independent vs. unified Alt-click (Option-click) on an anchor pointSelect multiple warp anchor pointsShift-click on additional anchor pointsSwitch back to Free Transform from WarpClick the Warp toggle icon again
  Flip & Rotate (via context menu)
  Right-click inside the transform box to access: Rotate 180°, Rotate 90° CW, Rotate 90° CCW, Flip Horizontal, Flip Vertical.
  Repeat & Additional
  Action, Shortcut
  Repeat last transformation Ctrl+Shift+T (Cmd+Shift+T)Repeat transformation on a copyCtrl+Alt+Shift+T (Cmd+Option+Shift+T)Move the object while in transformClick and drag inside the bounding box (not on a handle or the reference point)

### PHASE 2.3: Selection Context Menu

- [ ] Selection tool: add options to existing right-click context menu with options for
      -- [ ] Select Inverse
      -- [ ] Deselect
      -- [ ] Reselect
      -- [ ] Layer via Copy
      -- [ ] Layer via Cut
      -- [ ] New Layer…
      -- [ ] Free Transform
      -- [ ] Transform Selection
      -- [ ] Fill > menu
      -- [ ] Stroke > menu
      -- [xx] Select All Layers (skip for now)
      -- [xx] Save Selection… (skip for now)
      -- [xx] Make Work Path… (skip for now)
      -- [xx] Refine Edge (skip for now)

### PHASE 3 - SAM SEGMENTATION

- [ ] segmentation/SAM-driven layer creation flows - see web/components/sketch/FEAT-2-SAM.md

### PHASE 4 - ADVANCED FEATURES

### 4.1 - Delayed technical follow-up

These are still real tasks, but they should wait until the Phase 1 groundwork is stable enough that we can make one clean decision instead of adding temporary behavior that will be replaced later.

- [ ] decide whether layer thumbnails should remain raw `Layer.data` previews or move to resolved/effected runtime previews; delay until preview semantics and layer-panel perf budget are explicit
- [ ] centralize snapshot/export/readback flow further and reduce unnecessary encoding/readback work; delay until the document-output contract stops moving
- [ ] rework alpha-lock and dirty-region behavior once the shared session + tool boundaries settle; delay until ordinary editing parity is stable
- [ ] decide blur/adjustments backend from profiling and correctness, not from a blanket "everything must be GPU" rule; delay until the shared CPU-backed tool paths are clean
- [ ] move blur and/or adjustments fully to GPU only if profiling shows a clear gain worth the added complexity
- [ ] add visual regression checks if manual smoke checks stop being sufficient; delay until current semantics are stable enough that snapshots will be trustworthy
- [ ] document color/alpha/HDR rules more formally once effect semantics, working-space rules, and export behavior stop moving

### PHASE 5 - FX LAYER

- [ ] add stackable FX layers under each layer as the long-term replacement for destructive adjustments
- [ ] first FX-layer slice: draggable/reorderable per-layer FX stack, toggle on/off, live preview, not baked into layer pixels, starting with combined hue/saturation/contrast and exposure
- [ ] support stacking multiple FX layers under one layer and define how they interact with groups, masks, exports, and future blend/effect ordering
- [ ] replace the provisional CSS-filter semantics with explicit effect semantics before locking in public FX behavior for exposure, lightness, or future presets
- [ ] add curves as a first-class effect with typed control-point or LUT data rather than forcing it into scalar adjustment semantics
- [ ] decide whether the first true exposure / tonemapping slice stays fully SDR or introduces HDR-capable intermediate passes to preserve highlight headroom before final mapping down
- [ ] add true exposure and professional tonemapping FX only after working-space, dynamic-range, and export semantics are explicit
- [ ] add bloom / glow / light accumulation style FX once the core non-destructive effect stack is stable

### PHASE 6 - IMPROVE PAINT AND SELECT

- [-] build a more programmable/extensible brush system on top of the shared paint/session seams
- [x] drawing extensions: ADJUSTABLE stabilizer controls to help with drawing less jaggy lines, similar to https://github.com/steveruizok/perfect-freehand. one implementation that all drawing tools can use.
- [ ] brush extensions: smudge/color-smudge
- [ ] define the first narrow goal for lit / PBR-style brushes once the WebGPU runtime and FX pipeline are stable (for example: one lighting model, one material response, and one expected visual use case)
- [ ] decide whether lit / PBR-style brushes need temporary above-display-range internal energy and which intermediate formats that implies
- [ ] build one focused lit / PBR brush prototype only after the goal and intermediate-format decision are explicit
- [ ] selection transform tools + selection move with (shift) arrow keys. note: do not move layer when selection active
- [ ] add AI-assisted tools such as healing or segmentation-driven layer creation

### PHASE 7 - COLOR PALETTES

- [ ] broader color-system ideas such as global palettes, predefined palettes, image-derived swatches. color palette in own panel. plan in new FEAT-3-COLOR-PALETTES.md before starting

## Future Features - Stroke Assist and Drawing UX

- [ ] evolve the new shared `strokeAssist` system beyond basic smoothing so brush, pencil, and eraser can all use the same guidance model without duplicating logic
- [ ] add more stroke assist presets tuned for real workflows, e.g. technical drawing, comic inking, loose sketching, and pixel-art-safe smoothing
- [ ] add modifier-key behavior for temporary assist overrides, e.g. hold a key to disable snap, force snap, or momentarily switch between freehand and guided modes
- [ ] extend stroke assist with additional low-analysis modes such as softer angle snap, perpendicular snap, and guide/rail style movement that does not depend on parsing existing strokes
- [ ] add optional visual feedback for active assist behavior, e.g. lazy-brush leash, snapped angle hint, or small preset/mode badge in the top bar
- [ ] investigate parallel-line helpers built on current stroke direction or explicit temporary guides, but avoid any version that requires heavy analysis of existing artwork in the first slice
- [ ] revisit smarter assist later: contextual guides, nearby-stroke attraction, or shape-aware snapping, only after the simple shared assist model feels stable and predictable

## Parked Ideas

These are not current priorities, but they should stay visible so they can be revived deliberately later.

### Parked - Nearer-Term

- [ ] replace the old `ImageEditor.tsx` path with the new `SketchEditor` once parity is strong
- [ ] richer export options such as alpha/opaque/JPEG choices
- [ ] healing brush and other AI-assisted painting tools

### Parked - Editor / Input Ideas

- [ ] touch/tablet features such as pinch zoom, two-finger pan, and palm rejection
- [ ] rulers and draggable guides
- [ ] make symmetry transformable
- [ ] rotate canvas view
- [ ] wrap-around/tiling mode
- [ ] text layers
- [ ] vector/pen tool
- [ ] portable project import/export, backup/download flows, and richer project persistence
- [ ] clipping masks / clipping groups

### Parked - Maybe Later

#### HDR / Pro Imaging

- [ ] wide-gamut / professional imaging workflows beyond the first SDR-focused editor slices
- [ ] import/export of higher dynamic range image data and any related document/export semantics
- [ ] HDR display/output support if it becomes a real product requirement rather than just an internal processing convenience

#### Other

- [ ] add canvas-size-from-input-layer. needs some planning
- [ ] plugin/tool extensibility as a product feature
- [ ] investigate PSD/ORA compatibility once the native document model settles
- [ ] PSD/ORA compatibility, SVG IO, and other external format work
- [ ] multi-document or multi-canvas workflows
- [ ] 3D layer support to allow compositing model3D type layers with basic translate, rotate, scale
- [ ] add performance guardrails for huge documents (warnings, history caps, throttling)

## Agent orientation (where things live)

**Base path:** `web/src/components/sketch/` (everything below is relative to that folder).

### Architecture

1. **Workflow node** — `../node/SketchNode/SketchNode.tsx` hosts the editor inside the graph (props, I/O, layout).
2. **Editor UI** — `SketchEditor.tsx` composes toolbar, layers panel, settings, shortcuts.
3. **Canvas** — `SketchCanvas.tsx` mounts the `<canvas>` and pulls in the hook bundle under `sketchCanvasHooks/`.
4. **State** — `state/` is a slice-based Zustand document store composed into `useSketchStore`; `hooks/*` wraps store updates and selectors.
5. **Input → pixels** — pointer flow lives in `sketchCanvasHooks/`; tools in `tools/`; actual drawing in `painting/`; document compositing lives in `rendering/` with WebGPU as the intended primary runtime and Canvas 2D retained for targeted helper paths.

### Folders

- **`sketchCanvasHooks/`** — Pointer events, compositing, overlay, keyboard modifiers, imperative canvas API. Heaviest files: `usePointerHandlers.ts`, `usePointerHandlerUtils.ts`.
- **`state/`** — slice-based store under `state/slices/` composed into `useSketchStore.ts`.
- **`hooks/`** — `useCanvasActions.ts`, `useLayerActions.ts`, `useHistoryActions.ts`, `useSketchStoreSelectors.ts`.
- **`rendering/`** — `WebGPURuntime.ts` / `initWebGPU.ts` / `shaders.ts` for the primary document runtime; `Canvas2DRuntime.ts` remains the reference/helper 2D path.
- **`painting/`** — `PaintSession.ts`, `CoordinateMapper.ts`, brush/pencil/eraser engines, `layerBounds.ts`.
- **`tools/`** — One module per tool; `toolDefinitions.ts` registers them; `tools/types.ts` for shared tool types.
- **`types/`** — shared TypeScript types split by domain and re-exported from `index.ts`.
- **`serialization/`** — Save/load document and layer payloads.

### UI pieces (same folder, top-level files)

Toolbar, layers list, color popover, tool settings: `SketchToolbar.tsx`, `SketchLayersPanel.tsx`, `LayerItem.tsx`, `ToolSettingsPanels.tsx`, `ColorPickerPopover.tsx`, `useEditorKeyboardShortcuts.ts`.

### Planning files to checkoff

- **Shortcuts:** `SHORTCUTS.md`
- **Shipped features log:** `SKETCH_FEATURES_DONE.md`

### Data flow

1. User acts on the canvas → `sketchCanvasHooks` routes by tool.
2. Tools / painting call into `rendering` or mutate layer buffers via the store hooks.
3. `useSketchStore` updates document state; compositing redraws.
4. Persist / restore goes through `serialization/`.
