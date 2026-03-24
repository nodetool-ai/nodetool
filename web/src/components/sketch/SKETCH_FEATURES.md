# Sketch Editor Roadmap

> **Status**: transform-aware layer foundation is in place; next work should stay focused on correctness and high-value workflows.
> **Last updated**: 2026-03-24

## Principles

- keep the document canvas fixed; off-canvas layer content must survive editing, history, and serialization
- prefer shared transform-aware infrastructure over ad hoc per-tool fixes
- keep ordinary raster workflows cheap and predictable
- only run sketch-related tests for normal iteration

## Current Priorities

- [ ] eliminate remaining move/nudge/paint regressions and add focused regression coverage for move, paint-after-move, undo/redo, and save/load roundtrips
- [ ] finish transform-only history and invalidation semantics so logical edits stay lossless and each user action creates one clean transaction
- [ ] centralize coordinate conversion between screen, viewport, canvas, layer-local, and selection spaces
- [ ] make selection truly per-pixel and add the next practical selection upgrades: lasso, magic wand, and feathering
- [ ] finish the exposed-layer workflow so exposed inputs can appear as editable layers without breaking preview/export behavior
- [ ] add first-class reference/image-backed layers with source, crop, transform, and IO metadata
- [ ] add the next transform workflow: live transform preview with commit/cancel, then scale/rotate/free transform on top of the shared layer model

## Important Follow-Up

- [ ] add adjustment layers or an equivalent non-destructive per-layer adjustment stack
- [ ] add group/folder layers
- [ ] make the canvas resizable from edges/corners with a solid interaction model
- [ ] fix foreground/background color state sync and simplify the color system backlog into one coherent picker/palette plan

## Later

- [ ] replace the old `ImageEditor` path with `SketchEditor` once parity is truly good
- [ ] add portable project import/export and an explicit backup path
- [ ] add clipping masks / clipping groups
- [ ] add performance guardrails for huge documents (warnings, history caps, throttling)
- [ ] improve cursor/tool previews where they still feel inaccurate
- [ ] add canvas-size-from-input-layer and similar workflow polish only after the core layer model is stable

## Stretch Goals

- [ ] build a more programmable/extensible brush system on top of the shared paint/session seams
- [ ] add AI-assisted tools such as healing or segmentation-driven layer creation
- [ ] investigate PSD/ORA compatibility once the native document model settles
- [ ] add advanced authoring features such as text, vector/pen, or richer multi-document workflows only after the raster core feels finished

## Completed Foundation

- [x] add `Layer.transform` and `contentBounds` to the document model
- [x] persist transform-aware layer data through serialization, history, export, and preview flows
- [x] render layers through transform-aware compositing instead of rewriting pixels on move/nudge
- [x] keep persistent layer-local raster bounds so off-canvas pixels can survive normal editing
- [x] move brush, pencil, eraser, and basic shape commit onto the shared paint-session model
- [x] track dirty rects and separate transient preview state from committed document state
- [x] restore layer previews and expose layers as input/output
- [x] ship core quality-of-life pieces already proven useful: alpha lock, symmetry modes, clone stamp basics, and trim-to-bounds

## Discarded / Parked Ideas

These are not current priorities, but they should stay visible so they can be revived deliberately later.

- `DISCARDED:` improve round cursor/tool preview accuracy, including size and rotation
- `DISCARDED:` move-tool modifier to directly move another layer via hit mask
- `DISCARDED:` rename the editor/node from "Sketch Input" to "Image Editor"
- `DISCARDED:` replace the old `ImageEditor` path with the new `SketchEditor` once parity is strong
- `DISCARDED:` adjustment layers as a richer non-destructive stack beyond the current baseline
- `DISCARDED:` portable project import/export, backup/download flows, and richer project persistence
- `DISCARDED:` clipping masks / clipping groups
- `DISCARDED:` canvas resizing from all borders/edges with richer drag UX
- `DISCARDED:` canvas size driven by an input layer
- `DISCARDED:` better cursor and pixel-workflow affordances such as grid overlay, snap-to-pixel, and crisp high-zoom view
- `DISCARDED:` tonemapping presets and richer export options such as alpha/opaque/JPEG choices
- `DISCARDED:` performance guardrails for very large documents
- `DISCARDED:` import PNG into current layer
- `DISCARDED:` touch/tablet features such as pinch zoom, two-finger pan, and palm rejection
- `DISCARDED:` rulers and draggable guides
- `DISCARDED:` rotate canvas view, wrap-around/tiling mode, radial palette HUD, gamut hints
- `DISCARDED:` advanced brush extensions such as stronger stabilizer controls, smudge/color-smudge, and richer symmetry expansion
- `DISCARDED:` more programmable/extensible brush definitions
- `DISCARDED:` text layers, vector/pen tool, and selection transform tools
- `DISCARDED:` healing brush and other AI-assisted painting tools
- `DISCARDED:` segmentation/SAM-driven layer creation flows
- `DISCARDED:` PSD/ORA compatibility, SVG IO, and other external format work
- `DISCARDED:` multi-document or multi-canvas workflows
- `DISCARDED:` 3D layer support
- `DISCARDED:` plugin/tool extensibility as a product feature
- `DISCARDED:` broader color-system ideas such as global palettes, predefined palettes, image-derived swatches, and a Krita-style wheel/square picker
- `DISCARDED:` full Photoshop-style shortcut parity backlog (`M/L/W`, `Ctrl+T`, `J`, `Shift+F5`, `Z`, `H`, `F`, guides, flow shortcuts, etc.)
