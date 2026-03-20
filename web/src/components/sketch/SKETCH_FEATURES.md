# Sketch Editor — Feature Checklist

Feature target / product spec: <https://mexes1978.github.io/manual-comfysketchpro/>
Reference implementation: <https://github.com/Mexes1978/comfyui-comfysketch/blob/main/js/comfysketch.js>

---

## Phase 1: Foundation + Usable MVP

- [x] Editor shell with fullscreen/modal editing
- [x] Raster painting basics
- [x] Brush with size/opacity/color/hardness
- [x] Pencil tool with size/opacity/color
- [x] Eraser with size/opacity/hardness
- [x] Undo/redo (history up to 30 entries)
- [x] Layers panel with visibility, reorder (up/down), add/delete/duplicate
- [x] Layer opacity slider
- [x] Layer blend modes (12 modes: normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion)
- [x] Layer renaming (double-click to edit)
- [x] Mask layer designation and export
- [ ] Optional input image loading into base layer
- [x] Autosave + reload from serialized sketch document
- [x] Flattened image export
- [x] Dedicated sketch node with optional input_image, image output, mask output
- [x] Serialized sketch state persisted on the node
- [x] Frontend property widget that opens the same editor
- [x] Property type wiring through PropertyInput.tsx
- [ ] Node registration through ReactFlowWrapper.tsx (custom renderer)

## Phase 2: Strong Parity for Common Workflows

- [x] Flood fill tool with tolerance setting
- [x] Eyedropper / color picker tool
- [x] Shape tools: line, rectangle, ellipse, arrow
- [x] Shape stroke color, stroke width, optional fill
- [x] Move / drag layer content tool (V shortcut)
- [ ] Multiple brush types (textured, scatter, etc.)
- [ ] Selection tools (rectangle select, lasso, magic wand)
- [ ] Crop tool
- [ ] Gradient tool
- [x] Mirror drawing (horizontal and vertical)
- [x] Color swatches (28 preset colors)
- [x] Keyboard shortcuts (tool selection, brush size, zoom, undo/redo)
- [x] Zoom and pan (scroll wheel zoom, middle-click/Alt+click pan)
- [x] Brush cursor preview (shows size on canvas)
- [ ] Palettes / custom swatch management
- [ ] Group/folder layers
- [ ] Better project persistence (local storage / file export)
- [ ] Cleaner node UI / preview behavior
- [ ] Import/export paths (PNG, project file)

## Phase 3: Advanced Parity / Extensibility

- [ ] Vector/pen tool
- [ ] Text layers
- [ ] SVG import/export
- [ ] Advanced brush system (dynamics, tilt, pressure)
- [ ] Multiple canvases/documents
- [ ] Richer project operations (save/load/templates)
- [ ] PSD/ORA compatibility
- [ ] 3D layer support
- [ ] Selection transform (scale, rotate, skew)
- [ ] Clipping masks
- [ ] Layer effects / filters
- [ ] Custom plugin / tool extensibility

## Architecture

- [x] Modular editor package under `web/src/components/sketch/`
- [x] Zustand store for state management (`state/useSketchStore.ts`)
- [x] Typed, versioned serialized document format (`types/index.ts`)
- [x] Serialization utilities (`serialization/index.ts`)
- [x] Thin nodetool integration wrappers (SketchProperty, SketchNode)
- [x] Canvas 2D rendering engine with layer compositing
- [x] Shape preview overlay canvas
- [x] Test suite (types, store, serialization, data flow)

## Deferred Items

- Custom ReactFlow node renderer for sketch
- Input image loading into base layer
- PSD/ORA import/export
- 3D layer support
- Plugin/tool extensibility system

## Recommended Follow-ups

- Extract tool logic into modular tool classes (`tools/` directory)
- Add selection tools for copy/paste/transform workflows
- Add pressure sensitivity support for drawing tablets
- Add layer thumbnail previews in the layers panel
- Add project file import/export (JSON + embedded images)
