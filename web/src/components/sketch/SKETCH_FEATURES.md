# Sketch Editor Roadmap

> **Status**: the transform-aware foundation, selection-derived layer actions, and merge-selected workflow are shipped on `sketch-editor-6`. Next focus: finish the remaining advanced transform items, then implement node-backed segmentation and image generation/editing flows.
> **Last updated**: 2026-04-25
> **Execution note**: this is the active sketch roadmap/backlog for the `sketch-editor-6` branch. Completed checklists are archived in `SKETCH_FEATURES_DONE.md`. `REFACTOR-SKETCH-APP.md` is supporting context; `REFACTOR-WEBGPU-TASKS.md` is no longer the active checklist.

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

## Recently Archived

Completed current tasks, display/interactions hardening, move/transform hardening, canvas refactors, selection-derived layer actions, and merge-selected workflow details live in `SKETCH_FEATURES_DONE.md` under **Archived From Active Roadmap (2026-04-25)**.

## TOP PRIORITY - Architecture Hardening Before New Features

Do these before advanced transform work, SAM, or new node execution surfaces. These are follow-up hardening tasks from the `sketch-editor-6` architecture sweep, focused on preventing the same classes of bugs that previously caused stale previews, layers jumping after move/transform, and CPU/GPU display drift.

- [x] [impl+test] make history snapshots document-complete for canvas and layer tree state
  - Extend history entries or their parallel snapshot data so undo/redo restores `document.canvas` dimensions/background together with layers.
  - Ensure layer structure snapshots preserve all metadata needed to rebuild groups and generated layers, including `parentId`, `collapsed`, `segmentationMeta`, image references, effects, exposed input/output flags, transforms, and content bounds.
  - Fix structural-history ordering so layer creation/removal entries capture the post-action structure needed for redo, not only the pre-action state.
  - Add regressions for crop/resize undo/redo, grouped/collapsed layer undo/redo, segmentation-generated metadata preservation, and add-layer redo.
- [x] [impl+test] close store-vs-runtime canvas drift in history restore paths
  - Audit `structure-only` restore paths and either replay affected pixels into runtime canvases or make the restore mode explicitly impossible for entries whose layer pixel data can differ from runtime surfaces.
  - Add tests that undo/redo transform, selection-derived layer actions, and structure-only entries, then immediately sample/export from runtime canvases without requiring an incidental redraw or brush stroke.
- [x] [impl+test] harden first-frame and hydration readiness semantics
  - Only advance `firstFrameComposited` / interaction readiness after a composite actually reaches the active display target; do not call initial-composite readiness after a no-op `compositeToDisplay` early return.
  - Split “hydration scheduled” from “hydration pixels decoded/uploaded” so async layer decode cannot mark the editor interaction-ready before startup pixels and GPU invalidation are complete.
  - Add tests for fresh-open brush tap, first transform preview, image-backed startup layers, WebGPU bootstrap, and Canvas2D fallback with no prior stroke.
- [x] [impl+test] wire transform preview through one coordinator-aware path
  - Pass the display coordinator through the transform-preview bridge or otherwise route preview redraws with an explicit `transform-preview` reason.
  - Compare full transform identity, including matrix data, when deciding whether a transform preview update can skip redraw.
  - Add tests for matrix-authoritative layers, preview-only transform changes, and startup transform preview without a preceding brush stroke.
- [x] [impl+test] reconcile transform target-set semantics with actual tool behavior
  - Decide whether `TransformTool` is single-target for now or truly multi-target. If single-target, narrow `TransformTargetSet` naming/comments/state so it cannot imply union-gizmo multi-layer transform support. If multi-target, drive hit-testing, gizmo bounds, preview, and commit from the union helpers and define per-layer preview application.
  - Add tests that prove `Shift+click` target behavior cannot leave stale IDs, wrong gizmo bounds, or mismatched preview/commit targets.

## Next Implementation Queue

Work from this list top to bottom. Keep each item focused and covered by sketch-specific tests before moving to the next one.

1. **Architecture hardening:** complete the top-priority history/runtime/readiness/transform-target tasks above.
2. **Finish transform modes:** implement distort, skew, perspective, and the UI mode/modifier rules listed in **2.3** before adding more AI workflow surface area.
3. **Finish selection/layer polish:** keep the selection context menu shipped state from `sketch-editor-6`, then implement only the remaining deferred selection actions when they are needed by concrete workflows.
4. **Complete SAM vertical slice:** put all SAM work in Phase 3: node discovery/availability, local HuggingFace and cloud/API-backed SAM configs, source transport, output normalization, cancellation, preview, and document-space layer apply.
5. **Reusable sketch node execution bridge:** after SAM works end-to-end, generalize the SAM execution/source/output contracts into a sketch image workflow executor for other image nodes.
6. **Built-in image workflows first:** expose text-to-image, image-to-image, and inpainting using existing nodetool nodes/presets before adding user workflow selection. Local HuggingFace img-2-img nodes should be first-class built-in options alongside cloud/API-backed nodes.
7. **User-selectable workflows second:** once built-in presets are stable, add a workflow picker that maps sketch inputs/outputs to saved user workflows without hardcoding model providers into the sketch editor.
8. **Layer output and visibility polish:** add the list-of-images output handle and drag-across visibility toggles after the node execution path can produce and consume layer groups cleanly.

Node execution rule: do not add new direct provider API paths for text-to-image, image-to-image, inpainting, or layer split. Use nodetool nodes via WebSocket execution, including local HuggingFace nodes and cloud/API-backed nodes as equal backend choices. Sketch prepares sources and applies normalized outputs; nodetool executes graphs. User-selectable workflows come later through the same bridge.


## Immediate `SketchEditor.tsx` Refactor Candidates

`SketchEditor.tsx` is materially better after the subscription-splitting work, but it still concentrates bootstrap, tool-mode side effects, shell wiring, and editor-session orchestration in one place. Do these before piling more behavior into the editor shell.

Completed refactor items (lifecycle hook, tool chrome, color router, store action bundles, URI resolution, preview-boundary tests, editor session layer, transform UI adapter, editor-shell module, command-surface hook, and related tests) are archived in `SKETCH_FEATURES_DONE.md`.

## Immediate `SketchCanvas.tsx` Refactor Candidates

`SketchCanvas.tsx` is much smaller than before, but it still mixes transient preview ownership, hook-bridge setup, and canvas chrome/layout in one place. Keep this refactor narrow and only extract seams that already want to exist.

Completed `SketchCanvas.tsx` refactor items are archived in `SKETCH_FEATURES_DONE.md`.

## Active Roadmap

Shipped backlog for this section (startup transform preview bug, selection mask CPU path + invert fix, store subscription hardening, selection performance plan notes) lives in `SKETCH_FEATURES_DONE.md`. Medium/long-term selection-mask GPU ideas are listed there for when profiling warrants them.

## PHASE 2 - Transform Foundation

Completed Phase 1 work, display/interactions core, move/transform hardening, and shipped transform foundations are archived in `SKETCH_FEATURES_DONE.md`. This section now tracks only remaining advanced transform behavior.

### 2.3 - Advanced transform modes and modifier rules

Preview ownership, spring-loaded move lifecycle, resolved gizmo bounds, preview-vs-commit parity, transform targeting, rotation, and pivot behavior are complete and archived in `SKETCH_FEATURES_DONE.md`.

- [x] support distort behavior on corner handles
- [x] support skew behavior on side handles
- [ ] support perspective behavior
- [x] add options for perspective, skew, and related advanced modes in the transform UI
  - Added Photoshop-style transform mode controls (`Auto`, `Scale`, `Distort`, `Skew`) and kept `Perspective` visible-but-disabled until the transform baking path moves beyond affine-only support.
- [ ] add warp mode
- [x] support repeat last transformation and repeat-on-copy workflows if the core transform model still supports them cleanly
  - Added repeat-last-transform and repeat-on-copy actions with Photoshop-style shortcuts (`Ctrl/Cmd+Shift+T`, `Ctrl/Cmd+Alt+Shift+T`) that reapply the last committed transform recipe to the active layer or its duplicate.

Modifier-key target behavior to preserve while implementing the items above:

- [x] `Ctrl` / `Cmd` -> independent vertex control (`Distort` on corners, `Skew` on edges)
- [ ] `Shift` -> constrain (proportional scale, 15-degree rotation snap, axis-lock distortion)
  - **Partial:** Proportional scale (Shift on corner handles), 15° rotation snap (Shift while rotating), and axis-lock distortion while using Photoshop-style corner distort are implemented.
- [x] `Ctrl+Shift` / `Cmd+Shift` -> skew on sides, constrained distort on corners
- [ ] `Ctrl+Alt+Shift` / `Cmd+Option+Shift` -> perspective

### 2.4 - Selection context menu

Completed selection context menu entries, selection-aware free transform, `Layer via Copy`, `Layer via Cut`, and `New Layer...` submenu details are archived in `SKETCH_FEATURES_DONE.md`.

Deferred selection-context-menu items:

- [ ] deferred: `Select All Layers`
- [ ] deferred: `Save Selection...`
- [ ] deferred: `Make Work Path...`
- [ ] deferred: `Refine Edge`

### 2.5 - FEATURES

Completed merge-selected layer actions are archived in `SKETCH_FEATURES_DONE.md`.

- [ ] add one output handle that combines all output layers in a list[image] output
- [ ] improve Layer visibility toggle: allow toggling layer visibility by presing mouse and holding - moving over several layers. the eye icon part of the layer item should be exempt of dragging

### PHASE 3 - SAM SEGMENTATION

Goal: ship SAM layer split as the first complete sketch-to-nodetool image workflow. This phase should prove the execution, source, output, cancellation, and document-space apply contracts before Phase 7 generalizes them to text-to-image, image-to-image, inpainting, and user workflows.

- [ ] [impl+test] define the SAM backend catalog and availability states
  - Use `web/src/components/sketch/sam/SamServiceNode.ts` as the starting service.
  - Keep local HuggingFace SAM and cloud/API-backed SAM as selectable peers in the same backend catalog. Existing SAM2 configs include `fal.image_to_image.Sam2Image` and `huggingface.image_segmentation.SAM2Segmentation`; add SAM3 as another node-backed config where its nodetool nodes are available.
  - Discover available node types from the nodetool node registry/manifest when possible; keep static config only as the curated preset layer, not as proof that a backend is actually installed or runnable.
  - Add explicit availability states per backend: available, missing node type, missing secret, missing local model, model downloading/loading, backend unavailable, and failed.
  - Include install/download/retry/cancel entry points for missing local HuggingFace models when the underlying node/runtime exposes those actions; otherwise show a clear “install outside sketch” state.
  - Tests should cover backend catalog entries, node discovery, availability state mapping, local HuggingFace readiness, missing secret/model copy, and selection persistence.
- [ ] [impl+test] finish the SAM WebSocket execution vertical slice
  - Use `web/src/components/sketch/sam/NodeExecutor.ts` as the transport seam. It already sends inline graphs through `globalWebSocketManager` with `run_job`; keep using the singleton WebSocket manager and do not create a sketch-specific socket.
  - Preserve a narrow executor contract: ensure connection, subscribe by `job_id`, send `run_job`, collect `node_update` / `output_update`, handle terminal `job_update`, and clean up subscriptions.
  - Add real cancellation semantics: client abort should update UI immediately and send/call backend cancel-job behavior when the runner supports it so long-running local jobs are not orphaned.
  - Tests should assert the exact `run_job` message shape, terminal success/failure handling, cancellation, timeout, and unsubscribe cleanup.
- [ ] [impl+test] make SAM source scope and transport explicit
  - Support `active layer` first, then `selected layers` and `visible composite` through the same export/readback helpers used by sketch rendering.
  - If a selection mask exists, pass it as a box/mask prompt when the chosen node supports it; otherwise use it only to crop/limit the source image and document the limitation in the UI.
  - Use small inline image payloads only when appropriate. For large images or multi-layer composites, upload/create assets or references first and pass asset/image references through the graph instead of large base64 payloads.
  - Preserve source metadata needed for output placement: source layer IDs, source bounds/origin, canvas size, selection bounds, and source transform.
- [ ] [impl+test] normalize SAM outputs before touching document layers
  - Add one parser/normalizer that accepts the output shapes returned by current SAM nodes: image objects, asset references, URLs, lists of images, masks, and RLE-like masks if SAM3 uses them.
  - Normalize every accepted result into a sketch-owned structure with `kind` (`mask`, `cutout`, or `mask-and-cutout`), dimensions, confidence/label when available, source node/backend metadata, and document-space bounds.
  - Tests should cover SAM2 fal output, HuggingFace local output, SAM3 output shape, empty outputs, partial outputs, malformed outputs, and output ordering.
- [ ] [impl+test] apply accepted SAM results in document space
  - Invariant: all generated layers return to document space, not source-image local space. Transformed, cropped, or off-canvas source layers must produce layers that align with the original document view.
  - Preview returned masks/cutouts before apply. Applying accepted results creates a new group of ordinary raster layers with document-space placement preserved.
  - One apply action must be one clean history step; generated layers must paint, move, transform, trim, export, and serialize without special rendering branches.
  - Tests should cover mask-to-layer placement, off-canvas sources, transformed sources, selected-layer sources, visible-composite sources, history, serialization, and export/readback behavior.
- [ ] [test] manually validate the complete SAM phase
  - Validate one-object extraction, multi-object separation, point/box prompt behavior, local HuggingFace backend, cloud/API-backed backend, cancellation, missing secret/model state, large image handling, and rerun behavior on a transformed or off-canvas source layer.

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

Shipped: adjustable stroke stabilizer (all drawing tools) — see `SKETCH_FEATURES_DONE.md`.

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


### PHASE 7 - NODETOOL NODE EXECUTION

Goal: let the sketch editor run existing nodetool image nodes and, later, user-selected workflows without embedding provider-specific APIs in sketch code. The sketch editor should prepare image/mask inputs, execute through the existing WebSocket workflow runner, and apply outputs as normal document layers.

#### 7.1 - Generalize the SAM execution bridge

- [ ] [impl+test] lift the SAM-proven executor into a reusable sketch workflow executor
  - Start from the SAM Phase 3 executor only after SAM cancellation, timeout, output, and source contracts are covered.
  - Keep transport responsibility narrow: ensure WebSocket connection, subscribe by `job_id`, send `run_job`, collect `node_update` / `output_update`, handle terminal `job_update`, cancellation, timeout, and errors.
  - Move SAM-specific naming such as `sketch_segmentation_*` behind a caller-provided job prefix so text-to-image, image-to-image, inpainting, and future workflow runs can share the executor.
  - Tests should assert the exact `run_job` message shape and that abort/timeout/cancel unsubscribes cleanly.
- [ ] [impl+test] add sketch input-source preparation helpers
  - Inputs: active layer, selected layers as a list, visible document composite, selection mask, and optional prompt text.
  - Reuse the SAM Phase 3 source transport contract: existing sketch render/export/readback helpers, asset/reference transport for large images, and document-space source metadata.
  - Preserve document-space metadata: source layer IDs, bounds/origin, canvas size, selection bounds, and transform state needed to place outputs correctly.
- [ ] [impl+test] add a single output application path for workflow images
  - Single image output creates a new layer above the source.
  - Multiple image outputs create a named group with one child layer per image.
  - Mask outputs can become layer alpha or companion mask layers only when the workflow preset declares that intent.
  - Reuse the SAM Phase 3 output normalizer shape and extend it only where non-SAM image nodes require additional output kinds.
  - Every apply action must be one clean history step and must serialize/export like ordinary layers.

#### 7.2 - Built-in node presets before user workflows

- [ ] [impl+test] add built-in preset descriptors for text-to-image, image-to-image, inpainting, and layer split
  - Presets should reference existing nodetool node types and input/output mappings; do not call fal, OpenAI, Replicate, HuggingFace, or other providers directly from sketch.
  - Built-in preset catalogs should list local HuggingFace nodes and cloud/API-backed nodes as backend choices under the same sketch workflow contract. Do not make local HuggingFace execution a hidden fallback or a later-only path.
  - Text-to-image preset inputs: prompt, optional negative prompt/settings, output size from document or user choice.
  - Image-to-image preset inputs: active layer, selected layers, or visible composite plus prompt/settings. Include local HuggingFace img-2-img nodes as first-class selectable presets when their nodetool node types are available.
  - Inpainting preset inputs: source image plus selection mask; disable or explain the action when no mask/selection is available.
  - Layer split preset inputs: source image plus optional point/box/selection prompt. This should reuse the completed Phase 3 SAM workflow as a built-in preset, not rebuild separate layer-split execution logic.
- [ ] [impl+test] add minimal UI entry points for built-in presets
  - Add sketch menu/toolbar actions for `Generate Image`, `Image to Image`, `Inpaint Selection`, and `Split Layer with SAM`.
  - Keep the first UI simple: source selector, prompt/settings fields that the preset requires, run/cancel state, and preview/apply/discard.
  - Surface missing secrets/model errors from node execution instead of pre-baking provider-specific checks into the sketch editor.
- [ ] [test] add end-to-end-ish mocked executor tests
  - Mock the shared executor and verify each preset builds the expected graph, sends the right source data, handles progress/error/cancel states, and applies outputs to layers/groups with correct placement.

#### 7.3 - User-selectable workflows after presets

- [ ] [impl+test] add workflow picker and mapping metadata
  - Allow selecting saved user workflows only after built-in presets prove the input/output contract.
  - Require explicit mapping between sketch sources (`activeImage`, `selectedImages`, `visibleComposite`, `selectionMask`, `prompt`) and workflow inputs.
  - Require explicit mapping from workflow outputs to sketch actions (`newLayer`, `newLayerGroup`, `replaceSelection`, `maskLayer`, `list[image] output`).
- [ ] [impl+test] persist last-used workflow mappings per sketch node/editor session
  - Persist workflow ID, input mapping, output mapping, and user-facing preset name.
  - Do not persist transient image data or secrets.
- [ ] [test] validate workflow compatibility and failure states
  - Missing workflow, incompatible inputs, no image outputs, cancelled job, failed job, and partial outputs should all produce clear UI states without mutating the document unless the user applies a preview.


### PHASE 8 - COLOR PALETTES

- [ ] broader color-system ideas such as global palettes, predefined palettes, image-derived swatches. color palette in own panel. plan in new FEAT-3-COLOR-PALETTES.md before starting


#### Performance
The `combineMasks()` fast-path covers the most common hot path (add/subtract on same-size canvas-origin masks). If profiling later shows selection-mask combine is still too slow on huge canvases, revisit it as an architecture/performance decision rather than a pre-chosen implementation path:

1. **Short term (done):** typed-array fast-path in `combineMasks()`. Single-pass flat loop; no union buffer allocation when masks share size/origin.
2. **Future option:** evaluate a canvas-compositing path for mask combine operations (`globalCompositeOperation` such as `lighter`, `destination-out`, `destination-in`) if CPU loops become the bottleneck. This can be tested on the main thread first; worker `OffscreenCanvas` is a separate choice with extra threading/ownership costs. Any canvas path must handle threshold re-mapping because compositing works on RGBA, not single-channel masks.
3. **Future option:** evaluate a WebGPU compute path only if profiling shows the canvas-compositing path is still not enough for huge documents. Treat this as part of a broader renderer-ownership decision, not a local optimization, because worker/main-thread GPU ownership and readback costs add real complexity.


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
