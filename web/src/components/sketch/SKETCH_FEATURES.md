# Sketch Editor Roadmap

> **Status**: the transform-aware foundation is in place, but the next important work is to finish helper-tool architecture cleanup, close remaining redraw/sampling gaps, and only then continue with transform-heavy features.
> **Last updated**: 2026-04-09
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

## Immediate `SketchEditor.tsx` Refactor Candidates

`SketchEditor.tsx` is materially better after the subscription-splitting work, but it still concentrates bootstrap, tool-mode side effects, shell wiring, and editor-session orchestration in one place. Do these before piling more behavior into the editor shell.

- [x] [impl] extract a dedicated editor lifecycle/controller hook so initial-document seeding, canvas-ready gating, autosave snapshotting, tool-transition side effects, and imperative modal actions stop living in one component body
  - **Done:** Extracted `useEditorLifecycle()` hook in `hooks/useEditorLifecycle.ts`. Owns canvas-ready gating, initial-document seeding (`useLayoutEffect`), autosave snapshotting (`useEffect`), tool-transition side effects (adjust/transform/segment tool switches), and canvas-resize-handle localStorage preference. SketchEditor component body is now focused on composition/layout.
- [x] [impl+test] extract shared tool-chrome wiring so `ConnectedToolTopBar` and `ConnectedContextMenu` stop carrying parallel store subscriptions and nearly identical tool-settings/action plumbing
  - **Done:** Extracted `useToolChromeActions()` hook in `hooks/useToolChromeActions.ts`. Both `ConnectedToolTopBar` and `ConnectedContextMenu` now call this single hook instead of maintaining 14 parallel `useSketchStore` subscriptions each for per-tool settings setters and selection actions. Added 5 regression tests proving stable references and isolation from viewport/document changes.
- [x] [impl] centralize active-tool color intent routing so toolbar and layers-panel foreground-color changes use one shared helper instead of duplicating the same `activeTool` -> settings update mapping
  - **Done:** Extracted `useColorIntentRouter()` hook in `hooks/useColorIntentRouter.ts`. Both `ConnectedToolbar` and `ConnectedLayersPanel` now call this single hook instead of maintaining identical duplicated `handleFgColorChange` callbacks. Removed 6 unused store subscriptions from each connected component.
- [x] [impl+test] replace the large `useSketchStore(...)` action grab-bag in `SketchEditor.tsx` with focused editor action bundles or selector hooks for history, layer, canvas, color, and session-control concerns
  - **Done:** Created `useEditorStoreActions.ts` with 5 focused bundle hooks: `useHistoryStoreActions()`, `useLayerStoreActions()`, `useCanvasStoreActions()`, `useColorStoreActions()`, `useSessionStoreActions()`. Replaced ~60 individual `useSketchStore((s) => s.someAction)` calls in SketchEditor with grouped bundle destructuring. Added 13 regression tests proving bundle completeness, reference stability, and cross-bundle isolation.
- [ ] [impl+test] isolate transient editor-session ownership across `SketchEditor.tsx`, `SketchCanvas.tsx`, transform preview state, canvas-resize-handle preference, segmentation side effects, and shell-only refs behind a dedicated session layer so future tools stop extending multiple session seams at once
- [ ] [impl+test] unify displayed transform consumption for transform UI with the same transient preview owner used by compositing so `ConnectedToolTopBar` and `ConnectedContextMenu` stop depending on a parallel active-layer preview channel during drag
- [x] [test] add a regression test proving move/transform preview updates rerender transform UI consumers only, not `SketchEditor.tsx` or unrelated shell components
  - **Done:** Added `transformPreviewBoundaries.test.tsx` with 5 tests proving: preview updates do NOT rerender toolbar/layers-panel selectors; preview updates DO rerender transform consumers; rapid updates stay isolated; clearing preview only rerenders transform consumers.
- [x] [impl+test] centralize sketch layer source URI resolution so hydration/runtime code and non-sketch preview renderers stop duplicating `asset://` to `/api/storage/` handling in separate helpers
  - **Done:** Created `utils/resolveAssetUri.ts` as the single source of truth for `asset://` → `/api/storage/` resolution. Updated `useLayerHydration.ts` (sketch), `output/hooks.ts` (node output), `useNodeResultHistory.ts`, and `createAssetFile.ts` to use the shared utility. Also exported `isAssetUri()` helper.
- [x] [test] add regression coverage proving locked exposed-input layers hydrate and show move/transform preview before any brush stroke, including `asset://`-backed image references
  - **Done:** Added 3 tests in `transformPreviewBoundaries.test.tsx`: image-reference layer shows preview without brush stroke; locked layer with imageReference shows preview; `asset://` URI is preserved through document state for hydration.
- [x] [test] add focused regression coverage for tool-switch lifecycle rules so leaving `adjust`, `transform`, or `segment` still cancels, initializes, and preserves the correct preview/session state after the refactor
  - **Done:** Added 6 tests in `transformPreviewBoundaries.test.tsx`: switching from transform/move clears preview; switching between non-preview tools is clean; adjust/segment tool switches are clean; rapid tool switches preserve consistent state.

## Active Roadmap

Completed Phase 1 packages, hardening work, and earlier shipped fixes have been moved to `SKETCH_FEATURES_DONE.md` so this file stays focused on the next work to execute from top to bottom.

- [x] **[BUG] Move/Transform live preview does not work at startup (before first brush stroke)**
  - **Symptom:** When the sketch editor first opens (especially with an imageReference/exposed-input layer as the active layer), using MoveTool or TransformTool shows the gizmo correctly and the gizmo DOES update while dragging, but the visible layer pixel content does NOT follow — it stays at its original position. After the user makes any brush stroke, the preview works correctly for the rest of the session.
  - **What works:** Layer is visible at startup; gizmo appears immediately when tool is selected; gizmo handles update in real time during drag; after any brush draw the preview moves the layer correctly; preview commit on pointer-up works.
  - **What does not work:** During a drag with MoveTool or TransformTool, the rendered layer pixels do not move while dragging — only the gizmo follows the pointer. This is only broken at startup, before any brush stroke is made.
  - **Likely area:** `useTransformPreviewComposite` / `compositeToDisplay` path in the startup/bootstrap state. The gizmo updating confirms `setLayerTransformPreview` IS being called and `activeLayerTransformPreview` store IS updating, so the failure is downstream: either the rAF-composite targets the wrong canvas, the preview map is empty at rAF time, or `applyTransformPreviews` is not reaching the WebGPU/Canvas2D render path. A `console.debug("[SketchPreview] applying transform preview", ...)` log has been added to `useTransformPreviewComposite` (dev-only) to trace whether the composite fires with the correct preview map and canvas target at startup.
  - **Fix applied (v2):** Replaced async `requestRedraw()` (rAF) with synchronous `redraw()` (via `syncRedrawRef`) in both `setLayerTransformPreview` and `clearLayerTransformPreview`. The rAF path silently no-ops when a prior rAF is already pending (`redrawRequestRef.current !== null`), which happens because `onDown` calls `clearLayerTransformPreview` → `requestRedraw()` before `onMove` fires. Synchronous redraw matches the path used by brush strokes via `redrawDirty`, guaranteeing immediate compositing on every preview update regardless of bootstrap state or pending rAFs. The original `invalidateLayerRef` GPU texture force-invalidation on first drag is kept.
- [x] fix: Selection mask tool is still slow, especially with bigger canvas. especiall adding + removing from mask. if this is a fundamental problem with cpu processing, propose a short plan in SKETCH_FEATURES.md file
  - **Done:** Added fast-path in `combineMasks()` for same-size/same-origin masks (the common case). Eliminates union buffer allocation + base copy; runs a single flat loop. Also added `TypedArray.subarray()+set()` row-bulk copies in the general path. See perf plan below.
- [x] fix: Invert with Selection mask active: inverts pixels at wrong position, outside masked area. Investigate if core features, refactor, helpers or comments can be strengtened to prevent this kind of problems
  - **Root cause:** `invertLayerColors()` used only `contentBounds.x/y` for layer→document mapping, ignoring the layer `transform.x/y` offset. Other mask operations (`clearLayerBySelectionMask`, `fillLayerBySelectionMask`) correctly use `getLayerCompositeOffset()` which includes both. Fixed by switching to `getLayerCompositeOffset()`. Regression tests added.
  - **Hardening:** All per-pixel selection-constrained operations should go through the shared `getLayerCompositeOffset()` helper. JSDoc comments updated to document the mapping chain.

### Selection mask performance plan

The `combineMasks()` fast-path covers the most common hot path (add/subtract on same-size canvas-origin masks). Further gains for truly large canvases need GPU involvement:

1. **Short term (done):** typed-array fast-path in `combineMasks()`. Single-pass flat loop; no union buffer allocation when masks share size/origin.
2. **Medium term:** move selection combine operations to an OffscreenCanvas compositing path using canvas `globalCompositeOperation` (`lighter` for add, `destination-out` for subtract, `destination-in` for intersect). This offloads the per-pixel work to the browser's GPU compositor. Requires careful threshold re-mapping since canvas compositing works on RGBA, not single-channel masks.
3. **Long term:** if WebGPU is available, run selection combine as a compute shader. This is the ultimate solution for 4K+ canvases but adds complexity. Only worthwhile if profiling shows the medium-term path is still too slow.

- [x] [impl+test] store subscription hardening pass 1: make `SketchEditor.tsx`, `SketchModal.tsx`, and `hooks/useSketchStoreSelectors.ts` stop acting like broad subscription aggregators; hot state such as `zoom`, `pan`, `selection`, and similar fast-changing UI state should be consumed in the narrowest subtree that actually needs it
- [x] [impl+test] store subscription hardening pass 2: audit sketch UI props and split shell vs hot-path consumers so canvas/runtime overlays can subscribe to viewport and selection state without forcing toolbar, layers panel, modal chrome, or other editor shell pieces to rerender
- [x] [impl+test] store subscription hardening pass 3: stop returning fresh selector objects/functions from Zustand subscriptions in sketch hot paths; move object merging/derived view models behind local `useMemo` or focused child components so unrelated store writes do not invalidate whole subtrees
- [x] [impl+test] store subscription hardening pass 4: add focused regression coverage for sketch rerender boundaries so plain `setZoom`, `setPan`, `setSelection`, and similar hot-path store writes prove that only the intended subtree rerenders
- [x] [impl] document and enforce sketch store usage rules: broad shell components should subscribe only to stable/slow state, hot mutable state should stay near `SketchCanvas`/overlay consumers, and selector helpers should avoid bundling unrelated state just for convenience
  - **Done:** Created `STORE_RULES.md` with 7 documented rules and enforcement guidance. Removed the deprecated `useSketchStoreSelectors()` aggregator. Added `useActiveToolSettings()` narrow hook. Updated all connected component JSDoc comments documenting subscription boundaries.
- [x] [impl+test] store/document split hardening: reduce broad `store.document` fanout through `SketchEditor.tsx` and nearby shells so layer list, active layer, canvas metadata, transform state, and autosave/export plumbing do not all rerender together by default
  - **Done:** Split `ConnectedLayersPanel`'s broad `document` subscription into narrow field selectors (`document.layers`, `document.activeLayerId`, `document.maskLayerId`, `document.canvas.width`, `document.canvas.height`). Scalar fields (activeLayerId, maskLayerId, canvas dimensions) no longer cause rerenders when unrelated document mutations occur. Added regression tests in `subscriptionBoundaries.test.tsx`.
- [x] [impl+test] store/selection split hardening: keep committed selection state and live selection preview state separate so marquee/lasso/move/add/subtract flows can update overlays and preview refs without forcing full editor-shell subscriptions on every mask mutation
  - **Done:** Added cached `hasActiveSelection` boolean to `SelectionSlice` that's maintained when `setSelection`, `selectAll`, `invertSelection`, and `reselectLastSelection` are called. Shell components (`ConnectedToolTopBar`, `ConnectedContextMenu`) now subscribe to the stable boolean instead of the full selection mask, so mask mutations that don't change the boolean state don't trigger rerenders. Added regression tests proving boolean stability.
- [x] [impl+test] store/tool-settings split hardening: narrow `toolSettings` subscriptions so top bars, modal chrome, cursor/canvas hot paths, and non-active tool panels do not all rerender from one paint-tool slider or mode change
  - **Done:** Added `useActiveToolSettings()` hook that returns only the resolved settings for the currently active tool. Components that only need the active tool's settings can use this instead of `useResolvedToolSettings()`. Added regression tests proving isolation from zoom, pan, and selection changes. Documented usage guidance in `STORE_RULES.md`.
- [x] [impl] replace `hooks/useSketchStoreSelectors.ts` convenience bundling with clearer shell-level selector helpers or focused child subscriptions so new work cannot silently reintroduce broad hot-state dependencies into `SketchEditor.tsx`
- [x] [impl+test] audit `usePointerHandlers.ts`, `SketchCanvas.tsx`, and overlay/runtime bridge props for committed-store vs transient-preview boundaries so interaction state, buffer-heavy state, and UI shell state stop crossing the same prop chain by default
  - **Done:** Grouped `UsePointerHandlersParams` into 8 documented state tiers (committed document, viewport, transient refs, canvas refs, rendering infra, overlay callbacks, event callbacks, preview callbacks) with a boundary contract table. Grouped `SketchCanvasProps` by concern (committed state, viewport/tool, callbacks, layout). Added JSDoc boundary contract to `SketchCanvas` documenting the compositing-gets-bare-doc / pointer-gets-docWithTools / overlay-gets-docWithTools separation. Added 4 regression tests proving: toolSettings isolation from document reference, compositing params shape, zoom isolation from toolSettings, and subscription cross-isolation.
- [x] [impl+test] add regression coverage for document-, selection-, and tool-settings-driven rerender boundaries in `SketchEditor.tsx`, `SketchModal.tsx`, and `SketchCanvas.tsx` so future store wiring changes cannot quietly bring back full-editor invalidation
- [x] [impl] review autosave/export sync and other store-to-prop snapshot flows so persisted document snapshots stop depending on broad shell subscriptions when only localized hot state changed
  - **Done:** Documented autosave boundary contract in `SketchEditor.tsx` showing it fires only on committed document changes (not toolSettings slider ticks, zoom/pan, or selection). Documented export sync deferred-flush pattern in `useExportSyncActions.ts` with full contract explaining ref-based pending flags, flush timing, and no-store-subscription design. Added 4 regression tests proving document reference stability across toolSettings, zoom/pan, and selection changes.
- [x] fix: Selection mask tool is still slow, especially with bigger canvas. especiall adding + removing from mask. if this is a fundamental problem with cpu processing, propose a short plan in SKETCH_FEATURES.md file (duplicate of line 28)
- [x] fix: Invert with Selection mask active: inverts pixels at wrong position, outside masked area. Investigate if core features, refactor, helpers or comments can be strengtened to prevent this kind of problems (duplicate of line 30)

## NEXT UP - MOVE AND TRANSFORM TOOL

Do these before more transform-heavy work. The goal is to reduce brittleness in `MoveTool` + `TransformTool` and nearby overlay tools by sharing only the stable gizmo primitives, not by forcing all tools into one generic interaction framework.
Try to implement these tasks with only as much shared core as needed. It is fine to change core helpers and adapt focused tests when that removes real brittleness, but avoid introducing a broad new interaction framework just to satisfy one tool.
- [ ] [impl+test] unify move/transform preview ownership so compositing, gizmo drawing, and transform UI all read the same live preview source instead of the current parallel preview channels (`transformPreviewByLayerIdRef` vs active-layer preview singleton). either route move/transform through one shared preview-session contract or remove the duplicate path entirely. dragging must not show stale top-bar/context-menu numbers, mismatched gizmo position, or pointer-up jumps, including startup/image-hydration cases and layers with existing translation, scale, rotation, non-zero raster origin, or off-canvas raster bounds
- [ ] [impl+test] harden spring-loaded move (`Ctrl`/`Cmd` move while another tool stays active) so it cannot desync preview state from `TransformTool` session baseline/cancel logic. likely area: `interactionTool` changes currently do not run the same activation/deactivation lifecycle as real tool switches. after the modifier-drag finishes, the moved layer must keep the committed transform, move gizmo state must clean up correctly, and later transform cancel/reset must not restore stale pre-move state
- [ ] [impl+test] harden `MoveTool` gizmo geometry so move uses one explicit resolved-bounds contract for both the visible layer box and the off-canvas indicator. likely area: `MoveTool` currently derives extents from resolved raster bounds while `TransformTool` still prefers smaller `contentBounds` for gizmo sizing. decide one rule for visible bounds vs backing raster bounds; avoid fallback-to-document-size behavior; cover `contentBounds`, expanded raster bounds, rotated/scaled layers, and `imageReference` startup cases with focused regressions
- [ ] [test-first] investigate transform preview-vs-commit parity at the lowest stable seam, and treat bootstrap/backend promotion as a regression scenario rather than the assumed root cause. compare live preview compositing, reconcile/bake-to-pixels, and runtime display paths separately. likely area: `reconcileLayerToDocumentSpace()` still computes from raw canvas size/transform more directly than the resolved preview path. rotating/scaling semi-transparent pixels must not introduce edge halos, distorted alpha, stripe artifacts, or commit-only visual shifts, including layers with non-zero raster origin / expanded raster bounds
- [ ] [impl+test] add a minimal transform-targeting flow, not a generic multi-tool selection framework: optional auto-select toggle for `TransformTool`; clicking opaque pixels targets the topmost visible transformable layer; `Shift+click` adds/removes layers from the transform target set; the transform gizmo, transform UI, and live preview must use one shared bounds source for the targeted set. do not assume layers-panel multi-select is already the correct transform-target model unless their semantics are made intentionally identical
- [ ] [impl+test] expand transform hit policy only if it can stay local to transform gizmo layout/hit-testing: allow rotate when dragging just outside the box/near scale handles, add an explicit pivot handle, and support snapping the pivot to stable anchor points such as corners/edge handles. keep this built on the same resolved geometry/hit-test seam as the box/handles above, and do not spread it into a generic cross-tool gesture system unless repeated evidence demands it

Completed transform-core groundwork for shared gizmo primitives and narrow follow-up hardening has been moved to `SKETCH_FEATURES_DONE.md` so this section stays focused on the still-open move/transform work.

## PHASE 1 - Architecture Stability Before Transform-Heavy Work

### 1.1 - Helper-tool architecture blockers

Do these first. Recent clone/blur bugs showed that helper paint tools still duplicate too much lifecycle and sampling logic outside the shared seams.
- [x] opening editor should be faster, find causes, also: maybe image loading can happen after editor is opened
  - **Investigation:** The editor UI already shows immediately (`canvasReady` is set synchronously in `useLayoutEffect`). Image loading for layers already happens in the background (each `setLayerData` call starts an async `Image()` load concurrently). The main bottleneck for startup speed with `imageReference` layers is main-thread image decoding via `new Image()`.
  - **Fix applied:** Optimized `Canvas2DRuntime.setLayerData` to use `fetch()` + `createImageBitmap()` for HTTP/relative URLs (the common case for `imageReference` layers). `createImageBitmap` decodes images off the main thread, reducing blocking during editor startup when multiple layers load simultaneously. Falls back to the standard `new Image()` path for data URLs and if `createImageBitmap` is unavailable.
- [x] unify helper paint-tool stroke/session behavior so `CloneStampTool.ts` and `BlurTool.ts` stop carrying ad hoc copies of lifecycle, mapper setup, dirty-rect redraw, and alpha-lock behavior that already belong in shared paint/session boundaries
- [x] reduce remaining duplicated alpha-lock and per-stroke orchestration logic between `PaintSession.ts`, `CloneStampTool.ts`, and `BlurTool.ts`
- [x] harden affine dirty-region redraw behavior so transformed layers do not rely on translation-only invalidation assumptions during paint/helper-tool updates
- [x] add focused regression coverage for clone/blur correctness on transformed or bounds-expanded layers
- [x] add focused regression coverage for clone stamp anchoring across pan/zoom, second-stroke re-anchor, and `active_layer` vs `composited` sampling
- [x] verify and lock down selection parity for blur vs clone so both tools follow one documented clipping/selection rule

### 1.2 - Remaining correctness and UX fixes

Do these after the helper-tool architecture blockers above.

- [x] Selection tool: ellipse should not be cut off at the canvas border after drawing the selection
- [x] Sketch Node: remove `Layer In` / `Layer Out` from handle names so only the layer name is shown
- [x] Sketch Node: remove the default `Image Input` handle on the sketch node
- [x] rethink layer action buttons: sort them, decide what belongs in the top and bottom groups, remove crop-canvas icons from the main group, but keep crop in the context menu
- [x] fix small delay when starting brush strokes; mouse cursor hangs for about 50 ms right after starting a stroke. verify whether it still exists while working on this area
## PHASE 2 - Transform Foundation

### 2.1 - Transform, Zoom, Selection

Do not start advanced transform modes until these tasks are done.
Do not only fix this sections items with workarounds, investigate core implementations if needed.

- [x] keep the updated layer preview correct while scaling, moving, and future advanced transform modes; preview behavior must not diverge from commit/history/export
- [x] make the transform tool gizmo adapt to layer size so small layers do not get a full-canvas gizmo
- [x] fix top/left transform scaling; this remains a valid active bug
- [x] change transform `Commit`, `Cancel`, and `Reset` from text buttons to icon actions once the interaction semantics are stable
- [x] fix transform tool: zooming loses the transform gizmo
- [x] fix transform tool: confirm sometimes cuts off parts of layer. transformations should not delete layer parts.
- [x] fix transform tool: confirm transformation moves layer
- [x] fix transform tool: scaling is faster than mouse delta, causing transform handles to move away from mouse. the mouse position should dictate where handles go.
- [x] fix transform tool: scaling negatively should mirror - currently does not go beyond zero
- [x] fix zoom tool: zooming is still noticeable slow
- [x] fix transform tool: scaling is mostly broken after supposed fix, also does not show realtime update, only after confirm
- [x] fix transform tool: moving is broken after supposed fix
- [x] fix transform tool: scaling is partly broken, some handles do not work like right + left
- [x] fix Selection tool: still after proposed fix: starting a new selection AND ending a selection freezes shortly
- [x] fix CTRL + i shortcut to inverse layer colors: should adhere to selection mask if any exists

### 2.2 - Transform lifecycle shortcuts

Add the core transform lifecycle only after `2.1` is stable.

- [x] `Ctrl+T` / `Cmd+T` enters Free Transform
- [x] `Enter` / `Return` commits the transformation
- [x] `Esc` cancels the transformation
- [x] `Ctrl+Z` / `Cmd+Z` undoes the last handle adjustment while still in transform mode
- [x] right-click inside the bounding box opens a context menu with transform actions

### 2.3 - Advanced transform modes and modifier rules

Do not start these until preview parity, gizmo sizing, and lifecycle shortcuts are working cleanly.

- [x] transform tool: add ENTER and ESC shortcuts to confirm / cancel transformation (already implemented in 2.2 above)
- [x] implement the base modifier-key contract for transform interactions
  - **Done:** `modifierIntent.ts` provides centralized modifier-key interpretation (`ModifierSnapshot`, `selectionCombineMode()`, `shapeConstraintFromRefs()`). `TransformTool.ts` captures `shift` and `alt` modifiers during drag via `ctx.shiftHeldRef` and `ctx.altHeldRef`. `computeTransform.ts` consumes these for proportional lock, scale-from-center, and rotation snap.
- [x] support scale behavior for free, proportional, axis-only, and from-center cases
  - **Done:** `computeScaleTransform()` in `computeTransform.ts` implements all four modes: free (independent X/Y without Shift), proportional (Shift held — radial distance ratio), axis-only (edge midpoint handles constrain to single axis), and from-center (Alt held — `edgeFactor = 1` scales both sides symmetrically).
- [ ] support rotate behavior, including `Shift` snapping and pivot-point changes
  - **Partial:** Rotation via dedicated handle above top-center is implemented. Shift snaps to 15° increments via `snapAngle()` in `computeRotateTransform()`. Remaining: user-adjustable pivot point (currently always layer center).
- [ ] support distort behavior on corner handles
- [ ] support skew behavior on side handles
- [ ] support perspective behavior
- [ ] add options for perspective, skew, and related advanced modes in the transform UI
- [ ] add warp mode
- [ ] support repeat last transformation and repeat-on-copy workflows if the core transform model still supports them cleanly

Modifier-key target behavior to preserve while implementing the items above:

- [x] no modifier -> scale (default)
  - **Done:** Default handle interaction applies scale. `computeTransformForHandle()` dispatches to `computeScaleTransform()` for all handle types except `move` and `rotate`.
- [ ] `Ctrl` / `Cmd` -> independent vertex control (`Distort` on corners, `Skew` on edges)
- [ ] `Shift` -> constrain (proportional scale, 15-degree rotation snap, axis-lock distortion)
  - **Partial:** Proportional scale (Shift on corner handles) and 15° rotation snap (Shift while rotating) are implemented. Remaining: axis-lock distortion (requires distort mode which does not exist yet).
- [x] `Alt` / `Option` -> from center / symmetrical
  - **Done:** `computeScaleTransform()` uses `edgeFactor = alt ? 1 : 0.5` so Alt scales from center (both sides move) while no-Alt anchors the opposite edge.
- [ ] `Ctrl+Shift` / `Cmd+Shift` -> skew on sides, constrained distort on corners
- [ ] `Ctrl+Alt+Shift` / `Cmd+Option+Shift` -> perspective
- [ ] cursor position determines behavior: outside box = rotate, inside = move, on handle = transform
  - **Partial:** Inside box → move and on handle → transform are implemented via `hitTestHandles()`. Remaining: outside box → rotate (currently returns `null` / no interaction).

### 2.4 - Selection context menu

- [x] add a selection-tool right-click context menu entry for `Select Inverse`
- [x] add a selection-tool right-click context menu entry for `Deselect`
- [x] add a selection-tool right-click context menu entry for `Reselect`
- [x] add a selection-tool right-click context menu entry for `Layer via Copy`
- [x] add a selection-tool right-click context menu entry for `Layer via Cut`
- [x] add a selection-tool right-click context menu entry for `New Layer...`
- [x] add a selection-tool right-click context menu entry for `Free Transform`
- [x] add a selection-tool right-click context menu entry for `Transform Selection`
  - **Done:** Added `Transform Selection` menu entry in `SketchCanvasContextMenu.tsx` with `HighlightAltIcon`. Currently disabled (grayed out) — the `onTransformSelection` prop is optional and wired but no backend implementation exists yet. The entry will enable when transform-selection infrastructure is implemented.
- [x] add a selection-tool right-click context menu entry for `Fill`
- [x] add a selection-tool right-click context menu entry for `Stroke`

Deferred selection-context-menu items:

- [ ] deferred: `Select All Layers`
- [ ] deferred: `Save Selection...`
- [ ] deferred: `Make Work Path...`
- [ ] deferred: `Refine Edge`

### 2.5 - FEATURES
- [ ] add one output handle that combines all output layers in a list[image] output

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

- [ ] make a plan for a brush engine
- [ ] build a more programmable/extensible brush system on top of the shared paint/session seams
- [ ] brush engine: webgpu shaders, physics, fluids, particles, ...
- [ ] brush engine idea: google museum close up of brushes to sample from
- [ ] brush engine: modal with grid selection for brushes and area / toggle to test brushes quickly on a test canvas
- [ ] brush engine: add speed param to shapee brush width - faster = thinner
- [ ] brush engine: add feature to shape strokes after finishing a stroke: e.g. fade-in-out thickness / opacity with curve



- [x] drawing extensions: ADJUSTABLE stabilizer controls to help with drawing less jaggy lines, similar to https://github.com/steveruizok/perfect-freehand. one implementation that all drawing tools can use.
- [ ] brush extensions: smudge/color-smudge
- [ ] define the first narrow goal for lit / PBR-style brushes once the WebGPU runtime and FX pipeline are stable (for example: one lighting model, one material response, and one expected visual use case)
- [ ] decide whether lit / PBR-style brushes need temporary above-display-range internal energy and which intermediate formats that implies
- [ ] build one focused lit / PBR brush prototype only after the goal and intermediate-format decision are explicit
- [ ] selection transform tools + selection move with (shift) arrow keys. note: do not move layer when selection active
- [ ] add AI-assisted tools such as healing or segmentation-driven layer creation


### PHASE 6.1 - HELPERS
- [ ] Gizmos: improve gizmo code: refactor, prepare for more features for transform gizmos and brush preview gizmo
- [ ] Gizmos: brush preview should visualise hardness through a second ring and opacity with a different stroke pattern that is still visible with lowest opacity
- [ ] add Ruler on top and left with pixel, correct origin to canvas, correct  behaviour on zoom
- [ ] Guides: add basic guides system that for small auto-appearing guides relative to canvas and layer extends
- [ ] Crop: after dragging crop area, do not crop immediately. show editable transform gizmo to refine. do crop with icon button to confirm



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
