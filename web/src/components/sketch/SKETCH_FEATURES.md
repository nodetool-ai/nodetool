# Sketch Editor Roadmap

> **Status**: the transform-aware layer foundation and WebGPU runtime baseline are in place, but transformed-layer move/transform correctness is still not fully hardened. Next work should stay focused on preview/commit parity, gizmo alignment, shared layer bounds, and output consistency before new feature-heavy slices.
> **Last updated**: 2026-04-05
> **Execution note**: this is the active sketch roadmap/backlog. `REFACTOR-SKETCH-APP.md` is supporting context; `REFACTOR-WEBGPU-TASKS.md` is no longer the active checklist.

## Principles

- keep code clean, modular, and focused by responsibility
- keep the document canvas fixed; off-canvas layer content must survive editing, history, and serialization
- prefer shared transform-aware infrastructure over ad hoc per-tool fixes
- treat WebGPU as the primary document renderer in Electron; keep Canvas 2D only for explicit helper paths where it is still the better tool
- keep ordinary raster workflows cheap and predictable
- run sketch-focused tests during normal iteration, not full app tests
- when changing shortcuts, edit src/components/sketch/SHORTCUTS.md
- **harden before extending**: make core models and helpers solid with regression tests before adding new features on top of them

Task labels used below:

- `[impl]` implementation task
- `[test]` test-only task
- `[impl+test]` implementation plus regression coverage
- `[test-first]` write the proving test first, then fix code if the test exposes a gap

## PHASE 1: Current Priorities

### 1.1 - Core groundwork before new feature slices

Phase 1 guidance:

- remove duplicated rules and hidden exceptions; do not add a second temporary path beside the old one
- if a feature needs one-off transform math, sampling logic, export logic, or display exceptions, move that missing contract back into Phase 1 first
- if move, transform, compositing, hit testing, or overlays disagree, fix the shared geometry/preview/output seam instead of patching one tool
- keep these concepts distinct: raw stored layer pixels, resolved display/export surface, resolved geometry for bounds/hit testing/gizmos, and explicit state tiers for document state, live canvases, preview state, and resolved output
- every Phase 1 slice should add focused regression coverage when it touches transformed layers, preview/commit parity, or output consistency
- defer performance-only rewrites unless they remove architectural drift or unblock correctness; if a task turns into a product decision, move it to a later phase with a short note

Preferred shared seams:

- `painting/CoordinateMapper.ts` remains the single document<->layer coordinate contract
- `painting/resolvedLayerGeometry.ts` (new) should own effective raster bounds, composite offset, transformed extents, and visual bounds/hit targets
- `painting/transformPreview.ts` (new) should own preview-transform merge/update rules
- `rendering/` should own resolved-output generation from raw layer canvas to display/export/readback/thumbnail surface
- `hooks/useCanvasActions.ts` plus `sketchCanvasHooks/useCompositing.ts` should coordinate state-tier ownership and sync rules; tools should signal intent, not invent sync policy

Boundaries:

- do not add per-tool `getBounds`, `getExtents`, or `getPreviewTransform` helpers when the answer belongs in shared geometry or preview contracts
- do not let `MoveTool.ts`, `TransformTool.ts`, overlays, and hit testing each define their own layer extents
- do not let thumbnail/export/readback code choose ad hoc between raw `layer.data`, layer canvas, and effected output; route that through one resolved-output seam
- when fixing a cross-tool drift bug, add at least one shared-helper or cross-tool regression test

Phase 1 "done means":

- coordinate mapping done means preview, commit, hit testing, overlays, and helper tools use the same transform contract
- preview/commit parity done means live preview, committed pixels, history replay, and export agree for the same transformed layer state
- gizmo/bounds alignment done means move and transform gizmos, selection/marquee overlays, and hit targets align with the same resolved document-space layer extents used for rendering
- document-output path done means readback/export/isolate no longer depend on display-only behavior such as checkerboards or canvas borders
- shared hard-tool integration done means fill/clone/blur/adjustments use the same runtime/session seams as the simpler paint tools
- sampling contract done means eyedropper/auto-pick/clone-stamp sampling agree on transformed layers, isolate state, and active stroke state

Execution order for remaining Phase 1 work:

- [ ] **Package A — Core seam convergence**
  - do this first; it defines the shared preview, geometry, output, and state-boundary contracts the later tool fixes depend on
  - package is done when:
    - preview updates no longer replace full transform state during compositing
    - preview and commit use the same transform-resolution rules for transformed layers
    - state-tier ownership is explicit for editing, preview, history snapshot, thumbnail sync, and export/readback
    - a shared resolved-layer geometry seam exists and is used by the intended consumers
    - a shared resolved-output seam exists for display/export/readback and helper consumers in scope for Phase 1
    - behavior tests cover preview vs commit for moved + scaled/rotated layers and catch seam drift
  - tasks:
    - [x] [impl+test] make active-layer preview and final commit obey the same transformed-layer semantics so live preview does not diverge from history/export results
      - audit note: current move preview/commit coverage is strongest for translation-only paths; moving a layer with existing scale/rotation/matrix state still needs explicit hardening
      - required follow-up: preserve the full existing `LayerTransform` during move preview and commit, then add regression coverage for move-after-scale/rotate and preview merge with existing transforms
      - **landed**: `painting/transformPreview.ts` provides `mergeTransformPreview` used by both preview and commit paths; `MoveTool.ts` now captures the full transform (scale/rotation/matrix) on drag start and uses `mergeTransformPreview` for all preview updates; regression tests in `packageA-coreSeams.test.ts` cover moved + scaled/rotated layers
    - [x] [impl+test] normalize transform preview ownership so move and transform preview use one contract for full-transform preservation and compositing
      - suggested seam: keep preview state ownership in `SketchCanvas.tsx` / `useCompositing.ts`, and route preview writes through `painting/transformPreview.ts`
      - done means preview paths never replace a full transform with translation-only state, and preview rendering uses the same transform resolution rules as commit/history/export
      - boundary: `MoveTool.ts` and `TransformTool.ts` should request preview updates, but must not define separate transform-merge semantics
      - **landed**: `painting/transformPreview.ts` owns `mergeTransformPreview` (single merge rule) and `applyTransformPreviews` (compositing snapshot builder); `useTransformPreviewComposite.ts` uses `applyTransformPreviews` instead of inline layer-map replacement; MoveTool uses `mergeTransformPreview`; TransformTool already uses `ensureTransformMatrix` which is compatible
    - [x] [impl+test] clarify and enforce sketch state boundaries so stored document state, live layer canvases, deferred sync state, transient preview state, and resolved output cannot silently drift
      - suggested seam: document the ownership rules in `hooks/useCanvasActions.ts` and `sketchCanvasHooks/useCompositing.ts`, then remove or centralize all ambiguous sync paths
      - done means each editing flow has one clear source of truth at each stage (editing, preview, history snapshot, thumbnail sync, export/readback), and regression tests cover the boundary points where drift has already happened
      - boundary: tools should tell the system "start gesture", "update preview", "commit pixels/transform", or "end gesture", not decide thumbnail/export/history synchronization on their own
      - **landed**: state-tier ownership tables and sync rules documented in `useCanvasActions.ts` and `useCompositing.ts`; compositing contract explicitly states previews never mutate document state; export/readback documented as consumers not owners of compositing rules
    - [x] [impl+test] finish wiring `evaluateLayerEffects` / resolved-layer output through the remaining output paths so helper flows stay consistent with the main canvas, export, isolate preview, and merge/downstream bake paths
      - note: effects already called in display and export via `renderDocumentCompositeToContext`; remaining gaps are curves/tonemap/bloom which need shader implementations (Phase 5 FX layer work)
      - suggested seam: make the resolved-output contract explicit in `rendering/` with one helper for "raw layer canvas -> resolved surface used for display/export/readback/helper flows" so downstream code does not keep choosing between `layer.data` and effected runtime output ad hoc
      - boundary: helper readback paths should consume the same resolved-output contract as display/export; layer-panel thumbnail behavior stays out of scope for this task and remains a later explicit product decision
      - **landed**: `getResolvedLayerOutput(doc, layerId)` added to `SketchRuntime` interface and implemented in `Canvas2DRuntime` + `WebGPURuntime`; this is the single entry point for "raw layer canvas → resolved surface" that downstream code should use instead of choosing between `layer.data` and effected runtime output
    - [x] [impl+test] introduce one shared resolved-layer geometry helper so compositing, gizmos, overlays, and hit testing agree on transformed layer extents
      - suggested seam: add `painting/resolvedLayerGeometry.ts` with one place to answer: effective raster bounds, composite offset, transformed document-space extents, and visual bounds for gizmos/hit targets
      - use this shared contract from move/transform gizmos, selection/marquee alignment code, compositing helpers, and any layer hit testing that currently recomputes bounds ad hoc
      - boundary: after this lands, tools and overlays should stop recomputing transformed layer extents locally except for trivial presentation-only offsets
      - **landed**: `painting/resolvedLayerGeometry.ts` provides `resolveLayerGeometry`, `getTransformedExtents`, `getTransformedCorners`, `getCompositeOffset`, `getEffectiveRasterBounds`, `getTransformedCenter`, and `buildLayerMatrix`; regression tests in `packageA-coreSeams.test.ts` verify extents/corners/center agreement

- [x] **Package B — Dependent move/transform correctness**
  - start this after Package A lands the shared preview and geometry seams
  - assume Package A seams already exist; do not solve missing seam work locally here
  - package is done when:
    - move preview and commit preserve existing scale/rotation/matrix state
    - move/scale gizmos align with the rendered transformed layer
    - selection/marquee overlays and hit targets align with the same resolved transformed extents
    - transform-tool left/top handle behavior is fixed and no longer behaves like right/bottom scaling
    - move and transform behavior are verified through shared-seam behavior tests, not only local tool tests
  - tasks:
    - [x] [impl+test] Improve move tool: preserve existing scale/rotation/matrix during preview + commit on transformed layers; current move path is not fully correct beyond translation-only cases
      - **landed**: `MoveTool.ts` already used `mergeTransformPreview` for preview/commit (Package A); now also uses `getEffectiveRasterBounds` and `getTransformedExtents` from `resolvedLayerGeometry` for gizmo bounds; local `docRectToGizmo` removed in favor of shared `docRectToScreen`; 6 regression tests in `packageB-moveTransformCorrectness.test.ts` verify full transform preservation for translated, scaled, rotated, and combined layers
    - [x] [impl+test] Improve move/transform bounds visuals: move gizmo, scale gizmo, and selection/marquee overlays are currently not aligned to the layer correctly; they must use the same resolved transformed bounds as compositing and hit testing
      - this task should consume the shared resolved-layer geometry helper above, not add more one-off gizmo math inside `MoveTool.ts` or `TransformTool.ts`
      - **landed**: both `MoveTool.ts` and `TransformTool.ts` now consume `resolvedLayerGeometry` (`getTransformedCenter`, `getTransformedExtents`, `getEffectiveRasterBounds`) and shared `tools/transform/handleGeometry.ts` for handle positions; local `layerDocBounds` helper removed from `TransformTool.ts`; gizmo bounds, hit targets, and overlay extents all derive from the same resolved geometry seam; regression tests verify `getLayerGizmoBounds` agrees with `resolveLayerGeometry` and handle corners match resolved corners for identity, scaled, and rotated transforms
    - [x] [test] add regression coverage for move/transform gizmo alignment: for translated, scaled, and rotated layers, verify gizmo bounds/handles use the same resolved document-space extents as compositing and hit testing
      - **landed**: 41 tests in `__tests__/packageB-moveTransformCorrectness.test.ts` covering: gizmo alignment (7 tests), hit testing alignment (5 tests), left/top handle correctness (7 tests), transform computation (5 tests), cursor mapping (5 tests), selection overlay alignment (3 tests), move-after-transform round-trip (3 tests), and move preview preservation (6 tests)
    - [x] [impl+test] finish transform tool UX on top of the matrix-capable transform model: keep live preview correct, keep commit/cancel reliable, make move/scale gizmos align with the actual transformed layer, and fix left/top handle scaling so it does not behave like right/bottom scaling
      - **landed**: left/top handle scaling fixed in `tools/transform/computeTransform.ts` using signed distance ratios instead of absolute distances; handles now use direction-aware `signX`/`signY` multipliers so dragging left/top inward correctly decreases scale and outward correctly increases scale; gizmo drawing uses `getTransformedCenter` + `scaledHalfExtents` from shared geometry seam; regression tests verify left/top/top-left handles, and that left/right and top/bottom produce symmetric scale changes
    - [x] [impl+test] extract pure transform/gizmo math out of `tools/TransformTool.ts` so the tool file becomes interaction orchestration over shared geometry helpers instead of a second geometry engine
      - suggested split: `tools/transform/handleGeometry.ts`, `tools/transform/computeTransform.ts`, `tools/transform/cursorMapping.ts`
      - after this, `TransformTool.ts` should own hit flow, drag state, and calls into shared contracts, not geometry policy
      - **landed**: created `tools/transform/handleGeometry.ts` (handle positions, hit testing, doc-to-screen, geometry primitives), `tools/transform/computeTransform.ts` (move/rotate/scale computation, unified dispatcher), `tools/transform/cursorMapping.ts` (CSS cursor logic), and `tools/transform/index.ts` barrel export; `TransformTool.ts` reduced to interaction orchestration (lifecycle, pointer events, gizmo painting) that delegates all geometry to shared helpers
    - [x] [impl+test] simplify `tools/MoveTool.ts` once shared preview and resolved-geometry helpers exist so move interaction stops owning its own transform-merge and gizmo semantics
      - boundary: move must request preview updates and geometry queries from shared helpers rather than defining transform preservation locally
      - **landed**: removed local `docRectToGizmo` helper; gizmo now uses `getEffectiveRasterBounds` + `getTransformedExtents` from `resolvedLayerGeometry` for bounds, and `docRectToScreen` from shared `handleGeometry` for coordinate conversion; removed import of `getLayerCompositeOffset` in favor of resolved geometry seam

- [x] **Package C — Proof and parity hardening**
  - use this package to prove the remaining seams hold; if a test exposes a real gap, reopen the seam task above instead of forcing the test to fit broken behavior
  - package is done when:
    - remaining open proof/parity tasks are either checked off or converted into explicit implementation follow-up
    - selection constraint and selection-mode coverage exists and passes for the intended scenarios
    - no proof task remains blocked by a known unresolved seam bug without that dependency being called out explicitly
  - tasks:
    - [x] [impl+test] add tests for `applySelectionConstraint`: verify this against shared production logic rather than only conceptual/inlined test logic so fill/gradient selection clipping cannot drift
      - suggested seam: extract a shared helper under `selection/` and test that production helper directly
      - **landed**: extracted `applySelectionConstraint` (canvas-context variant) and `applySelectionConstraintToBuffers` (pure-data variant) into `selection/applySelectionConstraint.ts`; FillTool and GradientTool now import from the shared module; 15 tests in `__tests__/packageC-selectionConstraint.test.ts` cover inside/outside behavior, offset translation, mask-origin handling, threshold boundary, edge cases (empty/full/partial mask, transparent pixels), and parity verification
  - summary: this package was pure test + extraction work; no implementation gaps were discovered — the duplicated `applySelectionConstraint` logic in FillTool and GradientTool was identical and correct, so the extraction was a clean deduplication with no behavioral changes

- [ ] **Package D — Refactor support**
  - pull this in only when it directly reduces friction for Packages A or B; it is support work, not a separate rewrite track
  - package is done when:
    - remaining overloaded-file refactors needed to support Packages A and B are complete
    - no shared seam logic is still duplicated across overloaded files just because it was easier to leave it there
    - the remaining high-pressure files mainly orchestrate or delegate rather than acting as mixed-responsibility policy layers
  - tasks:
    - [ ] [impl+test] watch `sketchCanvasHooks/usePointerHandlers.ts` for router creep; extract any new shared hover / gesture / tool-routing policy before it becomes another mixed-responsibility policy file
      - only keep pointer-event routing and tool dispatch here; preview semantics, geometry rules, and sync decisions belong in their dedicated seams

Completed groundwork already landed:

- [x] centralize document-space <-> layer-space coordinate mapping so preview, commit, hit testing, overlays, and helper tools all follow one transform contract
  - all paint tools use `CoordinateMapper`; move auto-pick now uses shared `hitTestLayerAtDocPoint` with `CoordinateMapper`; eyedropper uses shared `sampleCompositeColor` via `readbackComposite`
  - shared utilities in `painting/sampleDocument.ts`: `sampleCompositeColor`, `sampleCompositeRGBA`, `hitTestLayerAtDocPoint`
- [x] eliminate the remaining transformed-layer regressions and add focused regression coverage for move/nudge/draw/export/autosave roundtrips
  - regression tests in `__tests__/phase1TransformRegression.test.ts` and `__tests__/samplingContract.test.ts`
  - covers: move roundtrip, nudge accumulation, draw-after-move coordinate mapping, cross-tool consistency, affine transform roundtrips
- [x] keep document-output rendering separate from display chrome and route readback/export/isolate through one resolved-output path; display-only checkerboard/border logic must never leak into sampling or export
  - fixed eyedropper: removed display canvas fast path that leaked checkerboard colors; now always uses `readbackComposite`
  - `renderDocumentCompositeToContext` excludes chrome; `compositeToDisplay` adds it; `flattenToDataUrl` and `readbackComposite` use the chrome-free path
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

Topical notes and completed checks by area remain below; the canonical remaining Phase 1 checklist is the execution-order packages above.

### 1.2 - Fixes

- [ ] Blur tool not working, does nothing when clicking. should also work for strokes.
- [ ] Clone Tool: draws at wrong position. also add small feedback at cursor when picking new position to clone.

- [x] Improve selection: rectangle clips at canvas bounds (correct), ellipse/lasso/polygon already extend beyond canvas (verified, no change needed)
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
- [x] [test-first] verify that `drainPendingStrokeCommit` runs before every operation that reads layer pixel data (history push, export, flatten, merge); replace the current smoke coverage with a real pending-stroke integration test that exercises the deferred commit path
- [x] audit all callers of `ensureLayerRasterBounds` (PaintSession, FillTool, ShapeTool, GradientTool, usePointerHandlerUtils) and verify each one uses the returned expanded bounds for CoordinateMapper, not the stale `layer.contentBounds`

### 1.4 - Harden coordinate mapping

`CoordinateMapper` is the single source of truth for document↔layer coordinate conversion. Every tool that places pixels, samples colors, or hit-tests selections must use it consistently. Current audit shows all paint tools use `CoordinateMapper` with `getEffectiveLayerRasterBounds` — but there is no regression coverage that enforces this stays true.

- [x] add dedicated regression tests for `CoordinateMapper`: verify `docToLayer` / `layerToDoc` round-trip identity for translation-only, scale+rotation, and full affine transforms; verify that `offset` getter matches `docToLayer({0,0})` negation; verify singular matrix fallback returns identity
- [x] add a cross-tool coordinate consistency test: for a layer with a non-trivial transform (e.g. translated + rotated), verify that PaintSession, FillTool, CloneStampTool, GradientTool, BlurTool, and ShapeTool all produce the same `docToLayer` result for the same document-space point — this catches any tool that constructs CoordinateMapper with different config
- [x] verify that overlay preview drawing (selection outlines, shape preview, gradient preview) uses the same coordinate mapping as the committed pixels — a preview drawn at screen position X should result in committed pixels at the same X after commit
- [x] verify that `dirtyToDoc` rect conversion is consistent with the compositing offset used by `getLayerCompositeOffset` — dirty-region redraws should exactly cover the area that changed

### 1.5 - Harden selection model

The selection system (`Selection` type, mask creation, hit testing, constraint application) is used by every tool that respects selections. The mask creation functions are well-separated by mode, but the combination and constraint paths lack dedicated tests.

- [x] add dedicated tests for `selectionHitTest`: verify correct results at selection boundary pixels, outside selection, at `originX/originY` offset, and with non-zero origin
- [x] add dedicated tests for `combineMasks` in all four modes: replace, add (union), subtract, intersect; verify that combine result matches expected mask data for overlapping and non-overlapping inputs
- [x] add tests for `selectionHasAnyPixels`: verify correct results for empty mask (all zeros), mask with a single selected pixel, and fully selected mask
- [x] verify that selection `originX/originY` is handled consistently: when a selection is created at a non-zero document offset (e.g. ellipse at x=50,y=50), verify that `selectionHitTest`, `applySelectionConstraint`, and paint clipping all account for the origin correctly
- [x] [test] verify that each selection mode (rectangle, ellipse, lasso, polygon, magic wand) produces a mask with correct `width`, `height`, and `originX/originY` values relative to the document canvas; current coverage is strongest for rectangle/ellipse/core mask ops and needs explicit lasso/magic-wand follow-up

### 1.6 - Harden compositing and rendering

The compositing pipeline (`renderDocumentCompositeToContext`) is the single path for both display and export. The per-layer compositing involves offset calculation, transform application, effects evaluation, and active stroke blending. Making this path trustworthy means display and export always agree.

- [x] [test] add test that verifies display compositing and `flattenToDataUrl` produce identical pixel output for the same document state (ignoring checkerboard background) — use real pixel equivalence, not only structural/mock coverage
- [x] add test that a layer with `contentBounds` offset at `(50, 50)` and transform at `(-10, -10)` composites at the correct document position (expected: top-left at `(40, 40)`) — this exercises the `getLayerCompositeOffset` + `drawWithTransform` pipeline
- [x] add test that the active stroke buffer composites at the correct opacity and blend mode during display, and that after commit, the committed layer matches the preview
- [x] add test that `getMaskDataUrl` returns only the mask layer content (not other layers) and respects the mask layer's transform and contentBounds offset
- [x] [test] add test that layer effects (`evaluateLayerEffects`) are applied during both display compositing and export — not just one path
- [x] [test] verify that `readbackComposite` (used by eyedropper and magic wand) samples the same pixels as the display shows, including layer transforms and effects

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
- [x] [test] add test for `serializeLayerData` / `deserializeLayerData` round-trip: verify helper-level bounds metadata and pixel data survive encode → decode; document-level serialization coverage is not enough on its own
- [x] add test that document serialization → deserialization preserves all layer contentBounds, transforms, effects, and pixel data — verify by comparing a freshly created document with one that has been serialized and deserialized

### 1.9 - Active feature work

- [x] fix layer visibility: layers not visible when opening editor until using a drawing tool, toggling layers does not always work, setting mask layer not always working correctly
- [x] fix brush strokes not visible when holding shift for straight lines - they only appear after releasing shift key. also all layers become invisible during drawing of straight lines

### 1.10 - Targeted refactor phase for overloaded files

These are not "clean up for its own sake" tasks. They are explicit support work for the shared geometry / preview / output / state-boundary contracts above. Do them when touching the related seams; avoid a separate broad rewrite branch.

- [x] [impl+test] split `hooks/useCanvasActions.ts` by responsibility so gesture lifecycle, transform actions, export/output sync, and canvas-geometry actions stop competing in one file
  - suggested split: `useStrokeLifecycleActions.ts`, `useTransformActions.ts`, `useExportSyncActions.ts`, `useCanvasGeometryActions.ts`
  - keep the boundary clear: this layer coordinates ownership/sync rules, but tool modules should still express intent rather than embedding sync policy
- [x] [impl+test] break up `sketchCanvasHooks/useCompositing.ts` so runtime bootstrapping, layer hydration, redraw scheduling, transform preview compositing, and pending-stroke draining are isolated behind smaller helpers
  - suggested split: `useRuntimeBootstrap.ts`, `useLayerHydration.ts`, `useRedrawScheduler.ts`, `useTransformPreviewComposite.ts`
  - keep this hook as the orchestrator, not the permanent home for every compositing concern
- [x] [impl+test] decompose `rendering/Canvas2DRuntime.ts` into internal engine modules so serialization/readback, resolved-output/effects, compositing, transform reconciliation, and mask/export helpers have clearer boundaries
  - suggested split under `rendering/canvas2d/`: `layerIO.ts`, `resolvedOutput.ts`, `composite.ts`, `reconcile.ts`, `maskAndExport.ts`
  - do not over-split public APIs early; prefer extracting cohesive internal modules first while keeping the runtime facade stable

## PHASE 2 - FIXES

- [ ] Blur tool currently only works with single click / dab, should also work with holding mouse / doing strokes
- [ ] fix small delay when starting brush strokes - mouse cursor hangs for 50ms right after starting a stroke
- [ ] rethink layer action buttons: sort, think about what should be in top and bottom groups, remove icons for crop canvas, but leave in context menu
- [ ] rename duplicate layers "[layer name] copy 1", 2, 3 ...
- [ ] remove Layer In / Layer Out from handle names, only layer name
- [ ] Remove the default Image Input handle
- [ ] adjust default settings for tools to sane values
- [ ] default brush should not have any smoothing
- [ ] Eraser shows all kinds of tool settings from brush and pencil together, should only show relevant settings from current erase mode


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

**Base path:** `web/src/components/sketch/`

### Main flow

1. `../node/SketchNode/SketchNode.tsx` hosts the editor inside the workflow graph.
2. `SketchEditor.tsx` composes the editor UI.
3. `SketchCanvas.tsx` mounts the canvas and wires the `sketchCanvasHooks/` bundle.
4. `state/` holds the slice-based Zustand document store; `hooks/` wraps document actions/selectors.
5. `sketchCanvasHooks/` routes pointer/compositing flow into `tools/`, `painting/`, and `rendering/`.

### Folder guide

- `sketchCanvasHooks/` — pointer routing, compositing, overlays, keyboard modifiers, imperative canvas API; key files include `usePointerHandlers.ts`, `useCompositing.ts`, `useTransformPreviewComposite.ts`, `useRedrawScheduler.ts`
- `hooks/` — document/store action hooks; recent splits include `useStrokeLifecycleActions.ts`, `useTransformActions.ts`, `useExportSyncActions.ts`, `useCanvasGeometryActions.ts`
- `state/` — slice-based store under `state/slices/`, composed into `useSketchStore.ts`
- `tools/` — one module per tool plus shared tool types/registration
- `painting/` — draw engines and shared paint math such as `PaintSession.ts`, `CoordinateMapper.ts`, `sampleDocument.ts`, `alphaLock.ts`, `layerBounds.ts`
- `rendering/` — document runtime/compositing; `WebGPURuntime.ts` is the intended primary runtime, `Canvas2DRuntime.ts` plus `rendering/canvas2d/` remain the helper/reference 2D path
- `serialization/` — save/load document and layer payloads
- `types/` — shared TypeScript types

### Useful top-level files

- UI shell: `SketchEditor.tsx`, `SketchCanvas.tsx`, `SketchToolbar.tsx`, `SketchLayersPanel.tsx`, `LayerItem.tsx`, `ToolSettingsPanels.tsx`, `ColorPickerPopover.tsx`
- shortcuts: `SHORTCUTS.md`
- shipped-feature log: `SKETCH_FEATURES_DONE.md`

### Data flow

1. Canvas input enters through `sketchCanvasHooks/`.
2. Tools and painting update preview state, layer buffers, or runtime requests.
3. Store/actions coordinate document state and history.
4. `rendering/` composites for display/export/readback.
5. `serialization/` persists and restores document state.
