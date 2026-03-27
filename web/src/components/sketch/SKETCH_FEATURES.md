# Sketch Editor Roadmap

> **Status**: transform-aware layer foundation is in place; next work should stay focused on correctness and high-value workflows.
> **Last updated**: 2026-03-26

## Principles

- keep code clean and modular with separation of concerns
- keep the document canvas fixed; off-canvas layer content must survive editing, history, and serialization
- prefer shared transform-aware infrastructure over ad hoc per-tool fixes
- keep ordinary raster workflows cheap and predictable
- only run sketch-related tests for normal iteration, not full app tests
- when changing shortcuts, edit src/components/sketch/SHORTCUTS.md

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
- [ ] add transform tool: live transform preview with commit/cancel, then scale/rotate/free transform on top of a matrix-capable layer transform model
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
- [x] radial palette HUD with color circle and a triangle inside for brightness and saturation, gamut hints like in krita.

### PHASE 3 - SAM SEGMENTATION

- [ ] segmentation/SAM-driven layer creation flows - see web/components/sketch/FEAT-2-SAM.md

### PHASE 4 - ADVANCED FEATURES

- [x] rename the editor/node from "Sketch Input" to "Image Editor"
- [x] import image into current layer by drop from outside and paste command
- [ ] add groupable layers as tree structure with drag and drop support, expand / close option
- [ ] better cursor and pixel-workflow affordances such as thin white grid overlay when zoomed in, snap-to-pixel, and crisp high-zoom view
- [x] improve selection mask to be able to select 1 pixel width exactly on close zoom
- [x] make the canvas resizable from edges/corners with a solid interaction model

### PHASE 5 - FX LAYER

- [ ] add stackable FX layers under each layer as the long-term replacement for destructive adjustments
- [ ] first FX-layer slice: draggable/reorderable per-layer FX stack, toggle on/off, live preview, not baked into layer pixels, starting with combined hue/saturation/contrast and exposure
- [ ] support stacking multiple FX layers under one layer and define how they interact with groups, masks, exports, and future blend/effect ordering
- [ ] add professional tonemapping as layer fx, additionally add presets for 10 distinctive but well-balanced looks

### PHASE 6 - IMPROVE PAINT AND SELECT

- [-] build- [ ] build a more programmable/extensible brush system on top of the shared paint/session seams a more programmable/extensible brush system on top of the shared paint/session seams
- [x] drawing extensions: stronger stabilizer controls to help with drawing less jaggy lines, similar to https://github.com/steveruizok/perfect-freehand. one implementation that all drawing tools can use.
- [ ] brush extensions: smudge/color-smudge
- [ ] selection transform tools + selection move with (shift) arrow keys. note: do not move layer when selection active
- [ ] add AI-assisted tools such as healing or segmentation-driven layer creation

### PHASE 7 - COLOR PALETTES

- [ ] broader color-system ideas such as global palettes, predefined palettes, image-derived swatches. color palette in own panel. plan in new FEAT-3-COLOR-PALETTES.md before starting

## Parked Ideas

These are not current priorities, but they should stay visible so they can be revived deliberately later.

### 3.2

- [ ] replace the old `ImageEditor.tsx` path with the new `SketchEditor` once parity is strong
- [ ] richer export options such as alpha/opaque/JPEG choices
- [ ] healing brush and other AI-assisted painting tools

### 3.3

- [ ] touch/tablet features such as pinch zoom, two-finger pan, and palm rejection
- [ ] rulers and draggable guides
- [ ] make symmetry transformable
- [ ] rotate canvas view
- [ ] wrap-around/tiling mode
- [ ] text layers
- [ ] vector/pen tool
- [ ] portable project import/export, backup/download flows, and richer project persistence
- [ ] clipping masks / clipping groups

### 3.4 MAYBE

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
4. **State** — `state/useSketchStore.ts` is the Zustand document; `hooks/*` wraps store updates (canvas, layers, history, selectors).
5. **Input → pixels** — pointer flow lives in `sketchCanvasHooks/`; tools in `tools/`; actual drawing in `painting/`; raster compositing in `rendering/` (main path: `Canvas2DRuntime.ts`).

### Folders

- **`sketchCanvasHooks/`** — Pointer events, compositing, overlay, keyboard modifiers, imperative canvas API. Heaviest files: `usePointerHandlers.ts`, `usePointerHandlerUtils.ts`.
- **`state/`** — `useSketchStore.ts` (layers, transforms, tool state, history pointers).
- **`hooks/`** — `useCanvasActions.ts`, `useLayerActions.ts`, `useHistoryActions.ts`, `useSketchStoreSelectors.ts`.
- **`rendering/`** — `Canvas2DRuntime.ts` (2D); `WebGPURuntime.ts` / `initWebGPU.ts` / `shaders.ts` for the GPU path.
- **`painting/`** — `PaintSession.ts`, `CoordinateMapper.ts`, brush/pencil/eraser engines, `layerBounds.ts`.
- **`tools/`** — One module per tool; `toolDefinitions.ts` registers them; `tools/types.ts` for shared tool types.
- **`types/`** — Shared TypeScript types (`index.ts`).
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
