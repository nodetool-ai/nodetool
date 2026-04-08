# Sketch Editor Roadmap

> **Status**: the transform-aware foundation is in place, but the next important work is to finish helper-tool architecture cleanup, close remaining redraw/sampling gaps, and only then continue with transform-heavy features.
> **Last updated**: 2026-04-07
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

## Active Roadmap

Completed Phase 1 packages, hardening work, and earlier shipped fixes have been moved to `SKETCH_FEATURES_DONE.md` so this file stays focused on the next work to execute from top to bottom.

## NEXT UP - GIZMO CORE HARDENING

Do these before more transform-heavy work. The goal is to reduce brittleness in `TransformTool` and nearby overlay tools by sharing only the stable gizmo primitives, not by forcing all tools into one generic interaction framework.

- [impl] extract shared gizmo-core viewport/document-to-screen conversion and overlay-canvas drawing helpers so `TransformTool.ts`, `MoveTool.ts`, and `CropTool.ts` stop carrying ad hoc mapping and paint setup
- [impl] split `TransformTool.ts` further so drag/session orchestration, hover-hit policy, and gizmo paint/layout no longer live together in one class
- [impl+test] add shared gizmo paint primitives for box outlines, square handles, circular rotation handles, and hover/active styling so transform gizmo rendering stops being hand-written inline
- [impl+test] migrate `TransformTool.ts` to the shared gizmo core first, then adopt the same primitives in `MoveTool.ts` and `CropTool.ts` only where it simplifies code without forcing a shared gesture lifecycle
- [test] add focused regression coverage for gizmo hit testing, hover cursor behavior, and redraw alignment during pan/zoom/live transform preview

### Follow-up core hardening after gizmo core

Only do these after the gizmo-core slice reveals that the boundaries are stable enough to share further. Keep them narrow and evidence-driven.

- [impl] extract a shared tool-runtime context builder so `usePointerHandlers.ts` and `tools/types.ts` stop maintaining parallel callback/ref contracts for the same tool surface
- [impl+test] centralize preview-session lifecycle for start/update/commit/cancel/clear so `MoveTool.ts`, `TransformTool.ts`, and selection-move preview follow one cleanup and stale-preview contract
- [impl+test] centralize selection overlay -> mask -> combine -> apply flow so `SelectTool.ts` stops repeating marquee/lasso/polygon/magic-wand finalization logic
- [impl+test] add a shared modifier-intent layer for transform and selection semantics so tools consume semantic flags like `fromCenter`, `constrain`, and `combineMode` instead of interpreting raw modifier refs ad hoc
- [test] add focused regression coverage for cancel/supersede/stale-session cleanup across preview tools so aborted gestures cannot leave stale gizmos, previews, or delayed selection commits behind

## PHASE 1 - Architecture Stability Before Transform-Heavy Work

### 1.1 - Helper-tool architecture blockers

Do these first. Recent clone/blur bugs showed that helper paint tools still duplicate too much lifecycle and sampling logic outside the shared seams.

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
- [ ] fix zoom tool: zooming is still noticeable slow
- [ ] fix transform tool: scaling is mostly broken after supposed fix, also does not show realtime update, only after confirm
- [ ] fix transform tool: moving is broken after supposed fix
- [ ] fix transform tool: scaling is partly broken, some handles do not work like right + left
- [ ] fix Selection tool: still after proposed fix: starting a new selection AND ending a selection freezes shortly
- [ ] fix CTRL + i shortcut to inverse layer colors: should adhere to selection mask if any exists

### 2.2 - Transform lifecycle shortcuts

Add the core transform lifecycle only after `2.1` is stable.

- [x] `Ctrl+T` / `Cmd+T` enters Free Transform
- [x] `Enter` / `Return` commits the transformation
- [x] `Esc` cancels the transformation
- [x] `Ctrl+Z` / `Cmd+Z` undoes the last handle adjustment while still in transform mode
- [x] right-click inside the bounding box opens a context menu with transform actions

### 2.3 - Advanced transform modes and modifier rules

Do not start these until preview parity, gizmo sizing, and lifecycle shortcuts are working cleanly.

- [ ] implement the base modifier-key contract for transform interactions
- [ ] support scale behavior for free, proportional, axis-only, and from-center cases
- [ ] support rotate behavior, including `Shift` snapping and pivot-point changes
- [ ] support distort behavior on corner handles
- [ ] support skew behavior on side handles
- [ ] support perspective behavior
- [ ] add options for perspective, skew, and related advanced modes in the transform UI
- [ ] add warp mode
- [ ] support repeat last transformation and repeat-on-copy workflows if the core transform model still supports them cleanly

Modifier-key target behavior to preserve while implementing the items above:

- [ ] no modifier -> scale (default)
- [ ] `Ctrl` / `Cmd` -> independent vertex control (`Distort` on corners, `Skew` on edges)
- [ ] `Shift` -> constrain (proportional scale, 15-degree rotation snap, axis-lock distortion)
- [ ] `Alt` / `Option` -> from center / symmetrical
- [ ] `Ctrl+Shift` / `Cmd+Shift` -> skew on sides, constrained distort on corners
- [ ] `Ctrl+Alt+Shift` / `Cmd+Option+Shift` -> perspective
- [ ] cursor position determines behavior: outside box = rotate, inside = move, on handle = transform

### 2.4 - Selection context menu

- [ ] add a selection-tool right-click context menu entry for `Select Inverse`
- [ ] add a selection-tool right-click context menu entry for `Deselect`
- [ ] add a selection-tool right-click context menu entry for `Reselect`
- [ ] add a selection-tool right-click context menu entry for `Layer via Copy`
- [ ] add a selection-tool right-click context menu entry for `Layer via Cut`
- [ ] add a selection-tool right-click context menu entry for `New Layer...`
- [ ] add a selection-tool right-click context menu entry for `Free Transform`
- [ ] add a selection-tool right-click context menu entry for `Transform Selection`
- [ ] add a selection-tool right-click context menu entry for `Fill`
- [ ] add a selection-tool right-click context menu entry for `Stroke`

Deferred selection-context-menu items:

- [ ] deferred: `Select All Layers`
- [ ] deferred: `Save Selection...`
- [ ] deferred: `Make Work Path...`
- [ ] deferred: `Refine Edge`

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

- [ ] build a more programmable/extensible brush system on top of the shared paint/session seams
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
