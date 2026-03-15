# Sketch Editor Implementation Plan

## Phase 1: Foundation + Usable MVP

### Editor Shell
- [x] SketchEditor main component composing canvas, toolbar, layers panel
- [x] SketchModal fullscreen/modal wrapper with header (title, save, close)
- [x] Portal rendering for proper z-index stacking
- [x] Keyboard shortcut support (Escape to close)

### Raster Painting Basics
- [x] Brush tool with stroke rendering
- [x] Eraser tool (destination-out composite)
- [x] Pointer events (pen/mouse/touch drawing)
- [x] Eyedropper / color picker tool

### Brush Size/Opacity/Color
- [x] Brush: size, opacity, hardness, color
- [x] Eraser: size, opacity
- [x] Real-time slider controls in toolbar
- [x] Color picker input

### Undo/Redo
- [x] History snapshot system (max 30 entries)
- [x] Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts
- [x] Undo/Redo toolbar buttons with enable/disable state
- [x] History truncation when editing after undo

### Layers Panel
- [x] Add / delete layers (minimum 1 enforced)
- [x] Layer visibility toggle
- [x] Reorder layers (up/down)
- [x] Duplicate layers
- [x] Rename layers (double-click)
- [x] Per-layer opacity slider
- [x] Per-layer blend modes (normal, multiply, screen, overlay, darken, lighten)

### Optional Input Image Loading
- [x] `loadImageToLayerData()` function in serialization
- [x] Aspect-ratio preserving image scaling
- [x] **Connect input_image handle to load image into base layer**
- [ ] Auto-resize canvas to match input image dimensions (deferred to Phase 2)

### Mask Layer Designation and Export
- [x] Designate any layer as mask via UI button
- [x] Stored in document as `maskLayerId`
- [x] Visual indication in layers panel
- [x] `exportMask()` function

### Autosave + Reload from Serialized Sketch Document
- [x] `serializeDocument()` — JSON stringify
- [x] `deserializeDocument()` — JSON parse with validation
- [x] `onDocumentChange` callback for autosave
- [x] Version field (v1) for future migrations
- [x] Metadata tracking (createdAt, updatedAt)

### Flattened Image Export
- [x] `flattenDocument()` — composite visible non-mask layers
- [x] `flattenToDataUrl()` — canvas ref method
- [x] `canvasToDataUrl()` / `canvasToBlob()` — PNG export
- [x] Respects layer visibility, opacity, blend modes

### Dedicated Sketch Node
- [x] Custom ReactFlow node component (`SketchNode.tsx`)
- [x] Input handle: `input_image` (optional)
- [x] Output handles: `image` and `mask`
- [x] Preview thumbnail generation
- [x] Edit button opens modal
- [x] Serialized state persisted in `sketch_data` property
- [x] Resizable node container
- [x] **Output image/mask data as ImageRef properties for downstream nodes**
- [x] **Process incoming `input_image` from upstream nodes and load into editor**
- [x] **Real-time export callbacks during live editing**

### Frontend Property Widget
- [x] `SketchProperty` component with preview thumbnail
- [x] "Open Editor" / "Click to edit" UI
- [x] Modal opens on click
- [x] Real-time serialization updates

### Property Type Wiring
- [x] `PropertyInput.tsx` — `case "sketch"` → `SketchProperty`

### Node Registration
- [x] `ReactFlowWrapper.tsx` imports and registers `SketchNode`

### Unit Tests
- [x] Type tests (defaults, helpers, isShapeTool, swatches)
- [x] Serialization tests (serialize/deserialize round-trip)
- [x] Store tests (CRUD, undo/redo, tool settings, blend modes)
- [x] 68 tests passing

---

## Phase 2: Strong Parity for Common Workflows

### Multiple Brush Types
- [x] Brush with size/opacity/hardness/color
- [x] Eraser with size/opacity
- [ ] Pencil (hard edge, 1px aliased)
- [ ] Airbrush / soft brush
- [ ] Custom brush shapes/textures

### Selection Tools
- [ ] Rectangular selection
- [ ] Elliptical selection
- [ ] Free-form / lasso selection
- [ ] Selection actions (cut, copy, paste, delete, invert)

### Move/Transform
- [ ] Move layer content
- [ ] Scale / resize
- [ ] Rotate
- [ ] Flip horizontal / vertical

### Crop
- [ ] Crop tool
- [ ] Canvas resize dialog

### Fill/Gradient
- [x] Flood fill tool with color tolerance
- [ ] Gradient fill tool (linear, radial)
- [ ] Pattern fill

### Shape Tools
- [x] Line tool
- [x] Rectangle tool
- [x] Ellipse tool
- [x] Arrow tool
- [x] Live preview overlay during draw
- [x] Stroke color/width, fill color, filled toggle
- [ ] Rounded rectangle
- [ ] Polygon tool

### Keyboard Shortcuts
- [x] Tool selection (B, E, I, G, L, R, O, A)
- [x] Undo/Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
- [x] Mirror toggle (M)
- [x] Brush size ([ / ])
- [x] Zoom (+ / -)
- [x] Canvas fit (Ctrl+0)

### Mirror Drawing
- [x] Horizontal mirror mode toggle
- [x] Mirror indicator in toolbar
- [ ] Vertical mirror mode
- [ ] Both axes mirror

### Palettes/Swatches
- [x] 28-color default swatch palette
- [x] Swatch grid in toolbar
- [ ] Custom palette save/load
- [ ] Recent colors

### Layer Opacity and Blend Modes
- [x] Per-layer opacity slider (0–1)
- [x] Blend modes: normal, multiply, screen, overlay, darken, lighten
- [ ] Additional blend modes (color-dodge, color-burn, hard-light, soft-light, difference, exclusion)

### Group/Folder Layers
- [ ] Layer groups/folders
- [ ] Group visibility toggle
- [ ] Nested layer hierarchy

### Better Project Persistence
- [x] JSON serialization with base64 layer data
- [ ] Compression for large documents
- [ ] Size warnings for large documents
- [ ] Export/import project files

### Cleaner Node UI/Preview
- [x] Preview thumbnail updates on document change
- [ ] Canvas size indicator in node
- [ ] Input/output status indicators

### Import/Export Paths
- [x] PNG export (flattened image)
- [x] PNG mask export
- [ ] Save to file / download
- [ ] Load from file / upload
- [ ] PSD export (stretch goal)

---

## Phase 3: Advanced Parity / Extensibility

- [ ] Vector / pen / text layers
- [ ] SVG import/export
- [ ] Advanced brush system (custom brushes, textures, dynamics)
- [ ] Multiple canvases / documents
- [ ] PSD/ORA compatibility
- [ ] 3D layer support (if feasible)
- [ ] Plugin / extension system

---

## Current Status Summary

| Category | Status |
|----------|--------|
| **Phase 1 Core** | ~98% complete |
| **Phase 1 Gaps** | Canvas auto-sizing from input image (deferred to Phase 2) |
| **Phase 2** | ~40% complete (shapes, fill, swatches, blend modes, mirror done) |
| **Phase 3** | Not started |
| **Tests** | 76 passing |
| **Type Safety** | Clean (no sketch-related type errors) |
