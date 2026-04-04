# Sketch Editor Roadmap

> **Status**: transform-aware layer foundation and a WebGPU document-runtime baseline are in place; next work should stay focused on parity, correctness, and high-value workflows.
> **Last updated**: 2026-04-04
> **Execution note**: near-term implementation order follows `REFACTOR-SKETCH-APP.md`; this file is the broader roadmap/backlog view.

## Principles

- keep code clean and modular with separation of concerns
- keep the document canvas fixed; off-canvas layer content must survive editing, history, and serialization
- prefer shared transform-aware infrastructure over ad hoc per-tool fixes
- treat WebGPU as the primary document renderer in Electron; keep Canvas 2D only for explicit helper paths where it is still the better tool
- keep ordinary raster workflows cheap and predictable
- only run sketch-related tests for normal iteration, not full app tests
- when changing shortcuts, edit src/components/sketch/SHORTCUTS.md

## PHASE 0: Current Fixes

- [ ] Improve selection rendering responsiveness during active selection edits and overlay redraws
- [ ] Improve move-tool responsiveness so dragging layers feels immediate even on larger documents
- [ ] Improve brush-setting responsiveness so size/hardness changes update without visible UI or cursor lag

## PHASE 1: Current Priorities

- [x] fix editor bootstrap so the canvas is visible immediately on open instead of only appearing after the first draw/erase interaction
- [x] fix moving the active layer with arrow keys (incl. Shift+10px nudge; transform deltas covered by `useSketchStore` tests)
- [x] fix exposed layers being treated as non-image datatypes where image-layer behavior is expected
- [x] fix: make input images appear in the editor as real reference/image-backed layers with source URI, crop/fit metadata, transform behavior, and explicit editing rules
- [x] improve node/editor layout so input handle titles are not covered by the preview and outputs sit below the preview cleanly
- [x] widen and clean up the right panel: spacing, icon order, icon position, and expose-button visibility
- [x] add focused regression coverage for transformed layers: move, nudge, paint-after-transform, undo/redo, serialize, reload, and repaint
- [x] define and enforce transform-only edit semantics explicitly across store, canvas actions, and history
- [x] transform-only actions: move, nudge, and future live transform preview/commit update `layer.transform` only, never rewrite `layer.data`, never change `contentBounds`, only invalidate compositing/overlay, and create one history transaction on commit/end
- [x] pixel-edit actions: brush, eraser, fill, gradient, blur, clone, clear, paste, and trim may change `layer.data` and raster bounds, and must use pixel/history sync paths rather than transform-only paths
- [x] raster-bounds rule: `contentBounds` tracks stored raster extent, not visual placement after transform; translate/nudge/preview must not mutate it
- [x] reconciliation rule: ordinary paint-after-move must stay transform-aware and must not reconcile to document space; reconciliation is allowed only for explicit destructive bake operations such as merge/flatten/rasterize/export-bake or an explicit "reconcile layer" command
- [x] history/invalidation rule: hover, drag preview, transient transform updates, and adjustment preview only invalidate; pointer-up, apply, confirm, or destructive bake creates exactly one undo step
- [x] adjustment tool semantics: current destructive adjustments should use preview + confirm/cancel, with no history spam while sliders move and exactly one undo step when confirmed
- [x] route all remaining pointer/helper paths through one shared coordinate model for screen, canvas, layer-local, raster-bounds, and selection-space math
- [x] add cut/copy/paste for selected pixels, including clipboard interop with images copied from outside apps
- [x] **Exposed Layers** turn exposed inputs into real document layers with stable IDs, clear locking/editability rules, and correct save/load/preview/output behavior. Exposed input layers are locked when receiving image data from inputs. Dynamic output handles are registered for exposed output layers. Toggle actions push history for undo/redo support.
- [ ] finish transform tool UX on top of the matrix-capable transform model: show live preview while transforming, keep commit/cancel reliable, and fix left/top handle scaling so it does not behave like right/bottom scaling
- [x] fix layer visibility: layers not visible when opening editor until using a drawing tool, toggling layers does not always work, setting mask layer not always working correctly
- [x] fix brush strokes not visible when holding shift for straight lines - they only appear after releasing shift key. also all layers become invisible during drawing of straight lines

## PHASE 2 - FIXES

- [x] remove white border around canvas, seems not to come from css?
- [x] make alpha texture resolution independent
- [x] fix history redo, currently not working. undo does work.
- [x] fix foreground/background color state sync, current foreground / background color should be source of truth for all tools
- [x] improve round cursor/tool preview accuracy: cursor now accounts for effective brush hardness (including brush type caps for soft/airbrush) to show the approximate visible paint extent rather than the mathematical maximum radius
- [x] keep drawing straight line with shift as one object / stroke until shift is released. currently overlapping lines multiply stroke and create visible seams at crossings and start dot.

## 2.1 - FEATURES

- [x] **Selection** replace the rectangle-only selection model with a per-pixel selection mask, then build lasso, magic wand, invert/add/subtract/intersect, smooth borders, and feathering on top of it
- [x] add auto-pick layer option to directly move another layer via hit mask (CTRL Alt+click picks topmost visible layer with non-transparent pixels)
- [x] spring-loaded move: hold Ctrl (Windows/Linux) or Cmd (Mac) to move layers without changing the selected tool or top tool bar; release to stop
- [x] Ctrl+Alt (Cmd+Option on Mac) + drag duplicates the active layer and moves the copy; Alt does not pan while Ctrl/Cmd is held
- [x] radial palette HUD with color circle and a triangle inside for brightness and saturation, gamut hints like in krita.

## PHASE 2.2: Transform Tool features and shortcuts

- [ ] Transform tool should show update while scaling, not only at commit
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

### PHASE 3 - SAM SEGMENTATION

- [ ] segmentation/SAM-driven layer creation flows - see web/components/sketch/FEAT-2-SAM.md

### PHASE 4 - ADVANCED FEATURES

- [x] rename the editor/node from "Sketch Input" to "Image Editor"
- [x] import image into current layer by drop from outside and paste command
- [x] add groupable layers as tree structure with drag and drop support, expand / close option
- [x] better cursor and pixel-workflow affordances such as thin white grid overlay when zoomed in, snap-to-pixel, and crisp high-zoom view
- [x] improve selection mask to be able to select 1 pixel width exactly on close zoom
- [x] make the canvas resizable from edges/corners with a solid interaction model

### WEBGPU PRIMARY RUNTIME - CURRENT PRIORITIES

- [ ] finish WebGPU compositing parity for ordinary editing: blend modes, transformed layers, isolate/solo behavior, and dirty-region behavior
- [ ] centralize full-document readback so eyedropper, selection sampling, clipboard/export helpers, and future thumbnails follow one set of rules
- [ ] document the approved Canvas 2D helper paths for the current WebGPU-first architecture (overlay/gizmo UI, cursor/HUD presentation, text rasterization helpers, controlled CPU readback/export) and move any other usage into explicit follow-up work
- [ ] replace loose layer-effect param bags with a typed per-effect model so curves, true exposure, tonemapping, and bloom have real data structures from the start
- [ ] wire `evaluateLayerEffects` / resolved-layer output through all relevant output paths so main canvas, export, isolate preview, merge/downstream bake paths, and future thumbnails stay consistent
- [ ] run a focused stylus-responsiveness smoke check after each major WebGPU slice and treat regressions in brush feel as blockers
- [ ] evaluate `webgpu-utils` and `colorjs.io` for the current runtime work, then explicitly decide adopt/defer for each; keep `gl-matrix` deferred until future lit/PBR brush math really needs it
- [ ] record fully GPU-native brush simulation and GPU selection compute as deferred until parity/readback/FX work is stable and profiling shows real benefit

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
