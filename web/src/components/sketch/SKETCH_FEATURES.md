# Sketch Editor Roadmap

> **Status**: transform-aware layer foundation is in place; next work should stay focused on correctness and high-value workflows.
> **Last updated**: 2026-03-24

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
- [ ] fix: make input images appear in the editor as real reference/image-backed layers with source URI, crop/fit metadata, transform behavior, and explicit editing rules
- [x] improve node/editor layout so input handle titles are not covered by the preview and outputs sit below the preview cleanly
- [x] widen and clean up the right panel: spacing, icon order, icon position, and expose-button visibility
- [ ] add focused regression coverage for transformed layers: move, nudge, paint-after-transform, undo/redo, serialize, reload, and repaint
- [ ] define and enforce transform-only edit semantics explicitly across store, canvas actions, and history
- [ ] transform-only actions: move, nudge, and future live transform preview/commit update `layer.transform` only, never rewrite `layer.data`, never change `contentBounds`, only invalidate compositing/overlay, and create one history transaction on commit/end
- [ ] pixel-edit actions: brush, eraser, fill, gradient, blur, clone, clear, paste, trim, and adjustments may change `layer.data` and raster bounds, and must use pixel/history sync paths rather than transform-only paths
- [ ] raster-bounds rule: `contentBounds` tracks stored raster extent, not visual placement after transform; translate/nudge/preview must not mutate it
- [ ] reconciliation rule: ordinary paint-after-move must stay transform-aware and must not reconcile to document space; reconciliation is allowed only for explicit destructive bake operations such as merge/flatten/rasterize/export-bake or an explicit "reconcile layer" command
- [ ] history/invalidation rule: hover, drag preview, and transient transform updates only invalidate; pointer-up, apply, confirm, or destructive bake creates exactly one undo step
- [ ] route all remaining pointer/helper paths through one shared coordinate model for screen, canvas, layer-local, raster-bounds, and selection-space math
- [ ] add cut/copy/paste for selected pixels, including clipboard interop with images copied from outside apps
- [ ] **Exposed Layers** turn exposed inputs into real document layers with stable IDs, clear locking/editability rules, and correct save/load/preview/output behavior
- [ ] add the next transform workflow: live transform preview with commit/cancel, then scale/rotate/free transform on top of a matrix-capable layer transform model

## PHASE 2 - FIXES

- [ ] remove white border around canvas, seems not to come from css?
- [ ] make alpha texture resolution independent
- [ ] fix history undo, currently not working
- [ ] fix foreground/background color state sync, current foreground / background color should be source of truth for all tools
- [ ] improve round cursor/tool preview accuracy, currently roughly 2 times too large
- [ ] keep drawing straight line with shift as one object / stroke until shift is released. currently overlapping lines multiply stroke and create visible seams at crossings and start dot.

## 2.1 - FEATURES

- [ ] **Selection** replace the rectangle-only selection model with a per-pixel selection mask, then build lasso, magic wand, invert/add/subtract/intersect, and feathering on top of it
- [ ] make the canvas resizable from edges/corners with a solid interaction model
- [ ] move-tool modifier to directly move another layer via hit mask
- [ ] radial palette HUD with color circle and a triangle inside for brightness and saturation, gamut hints like in krita.

### PHASE 3 - ADVANCED FEATURES

- [x] rename the editor/node from "Sketch Input" to "Image Editor"
- [ ] import image into current layer by drop from outside and paste command
- [ ] add group/folder layers
- [ ] segmentation/SAM-driven layer creation flows - see web/components/sketch/FEAT-2-SAM.md
- [ ] add adjustment layers or an equivalent non-destructive per-layer adjustment stack
- [ ] advanced brush extensions such as stronger stabilizer controls, smudge/color-smudge
- [ ] selection transform tools
- [ ] add AI-assisted tools such as healing or segmentation-driven layer creation
- [ ] build a more programmable/extensible brush system on top of the shared paint/session seams
- [ ] broader color-system ideas such as global palettes, predefined palettes, image-derived swatches. color palette in own panel
- [ ] add performance guardrails for huge documents (warnings, history caps, throttling)
- [ ] better cursor and pixel-workflow affordances such as grid overlay, snap-to-pixel, and crisp high-zoom view
- [ ] add professional tonemapping options, additionally add presets for 10 distinctive but well-balanced looks
- [ ] replace the old `ImageEditor.tsx` path with the new `SketchEditor` once parity is strong

## Parked Ideas

These are not current priorities, but they should stay visible so they can be revived deliberately later.

### 3.2

- [ ] adjustment layers as a richer non-destructive stack beyond the current baseline
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
