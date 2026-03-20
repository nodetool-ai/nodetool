# Sketch Editor — Comprehensive Feature Checklist

> **Status**: Phase 1 complete, Phase 2 in progress  
> **Last updated**: 2026-03-20

Feature target / product spec: <https://mexes1978.github.io/manual-comfysketchpro/>  
Reference implementation: <https://github.com/Mexes1978/comfyui-comfysketch/blob/main/js/comfysketch.js>

---

## Phase 1: Foundation + Usable MVP ✅

> Goal: ship a clean, stable, reusable editor foundation with image + mask output.

### Editor Shell
- [x] Fullscreen modal editing (SketchModal with z-index portal)
- [x] Main editor composition: Toolbar | Canvas | Layers Panel
- [x] Dark-mode MUI styling (follows nodetool theme)

### Raster Painting
- [x] Brush tool — size (1–200), opacity (0–1), hardness (0–1), color picker
- [x] Pencil tool — size (1–10), opacity (0–1), color picker
- [x] Eraser tool — size (1–200), opacity (0–1), hardness (0–1)
- [x] Flood fill tool — color picker, tolerance (0–128)
- [x] Eyedropper / color sampler — samples from composited canvas

### Undo / Redo
- [x] Undo/redo with full layer snapshots (max 30 entries)
- [x] Keyboard: Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo)
- [x] Branching: future history cleared on new action after undo

### Layers
- [x] Multiple layers with add / delete / duplicate
- [x] Layer visibility toggle (eye icon)
- [x] Layer reorder (move up / move down buttons)
- [x] Layer renaming (double-click inline edit)
- [x] Layer opacity slider (0–100% per layer)
- [x] Layer blend modes — 12 modes: normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion
- [x] Mask layer designation toggle + mask export
- [x] Layer locked state support
- [x] Active layer highlighting in panel

### Input Image
- [x] Optional input_image loading into base layer (via SketchNode connections)
- [x] Auto-resize canvas to match input image dimensions
- [x] Input image layer is locked (read-only base)
- [x] Input image replacement on upstream changes

### Serialization & Persistence
- [x] Versioned document format (SketchDocument v1)
- [x] JSON serialization/deserialization with validation
- [x] Autosave on every document change
- [x] Reload from serialized state (reopen/edit/continue)
- [x] Flattened image export (PNG data URL)
- [x] Mask layer export (PNG data URL)

### Node Integration
- [x] Dedicated SketchNode (custom ReactFlow node: `nodetool.input.SketchInput`)
- [x] Node registration in ReactFlowWrapper.tsx
- [x] Input handle: `input_image` (optional)
- [x] Output handles: `image` (flattened) + `mask` (mask layer)
- [x] Serialized sketch_data persisted on node properties
- [x] Canvas preview thumbnail on node
- [x] Real-time output export during editing

### Property Widget
- [x] SketchProperty widget with thumbnail preview
- [x] "Click to edit" / "Open Editor" button
- [x] Property type wiring through PropertyInput.tsx (`type: "sketch"`)
- [x] Document serialization back to property value

### Test Coverage
- [x] Type definitions & defaults (types.test.ts)
- [x] Store actions & state management (useSketchStore.test.ts)
- [x] Serialization round-trips (serialization.test.ts)
- [x] Data flow & SketchNode integration (dataFlow.test.ts)

---

## Phase 2: Strong Parity for Common Workflows 🔧

> Goal: cover the most important ComfySketch-style features for daily use.

### Drawing Tools
- [x] Shape tools: line, rectangle, ellipse, arrow
- [x] Shape settings: stroke color, stroke width, optional fill + fill color
- [x] Move / drag layer content tool (V shortcut)
- [x] Mirror drawing (horizontal M, vertical)
- [x] Clear active layer (Delete/Backspace shortcut + toolbar button)
- [x] Export canvas as PNG download (toolbar button)
- [ ] Multiple brush types (textured, scatter, airbrush)
- [ ] Selection tools (rectangle select, lasso, magic wand)
- [ ] Crop tool
- [ ] Gradient tool / gradient fill

### UI & Interaction
- [x] Color swatches (28 preset colors)
- [x] Keyboard shortcuts — full set: B/P/E/G/I/L/R/O/A/V/M, [/], +/−, Delete, Ctrl+Z/Y/0/S
- [x] Zoom and pan (scroll wheel zoom, middle-click / Alt+click pan)
- [x] Brush cursor preview (size indicator on canvas)
- [x] Tool-specific settings panels (dynamic per active tool)
- [x] Shortcuts reference panel in toolbar
- [ ] Palettes / custom swatch management (save/load palettes)
- [ ] Group/folder layers
- [ ] Drag-and-drop layer reordering

### Persistence & Export
- [x] Autosave on every stroke
- [x] PNG export download from toolbar (Ctrl+S)
- [ ] Better project persistence (localStorage backup / file export)
- [ ] Import PNG into current layer
- [ ] Export project file (JSON + embedded images)

### Node Behavior
- [x] Preview thumbnail on node
- [x] Real-time output updates during editing
- [x] Input image auto-loading with canvas resize
- [ ] Cleaner node UI styling refinements

---

## Phase 3: Advanced Parity / Extensibility 📋

> Goal: add higher-complexity features without destabilizing the foundation.

- [ ] Selection tools with transform (scale, rotate, skew)
- [ ] Vector/pen tool
- [ ] Text layers with font settings
- [ ] SVG import/export
- [ ] Advanced brush system (dynamics, tilt, pressure sensitivity)
- [ ] Multiple canvases/documents
- [ ] Richer project operations (save/load/templates)
- [ ] PSD/ORA compatibility import/export
- [ ] 3D layer support
- [ ] Clipping masks / clipping groups
- [ ] Layer effects / filters (blur, sharpen, etc.)
- [ ] Custom plugin / tool extensibility system

---

## Architecture

### Module Structure
```
web/src/components/sketch/
├── SketchEditor.tsx          # Main editor composition + keyboard shortcuts
├── SketchCanvas.tsx          # Core canvas engine (drawing, rendering, compositing)
├── SketchToolbar.tsx         # Tool selection + settings + actions
├── SketchLayersPanel.tsx     # Layer management UI
├── SketchModal.tsx           # Fullscreen modal wrapper
├── index.ts                  # Public API exports
├── types/index.ts            # Type definitions, defaults, format version
├── state/useSketchStore.ts   # Zustand store (document, tools, layers, history)
├── serialization/index.ts    # Serialization, flattening, image loading
└── __tests__/                # 4 test suites, 80+ tests
```

### Integration Points
```
web/src/components/properties/SketchProperty.tsx   → Property widget
web/src/components/node/SketchNode/SketchNode.tsx  → Custom ReactFlow node
web/src/components/node/PropertyInput.tsx           → "sketch" type dispatcher
web/src/components/node/ReactFlowWrapper.tsx        → Node type registration
```

### Architecture Checklist
- [x] Modular editor package under `web/src/components/sketch/`
- [x] Zustand store for state management
- [x] Typed, versioned serialized document format
- [x] Serialization utilities (JSON, flatten, mask export, image loading)
- [x] Thin nodetool integration wrappers (SketchProperty, SketchNode)
- [x] Canvas 2D rendering engine with layer compositing
- [x] Shape preview overlay canvas
- [x] Brush cursor preview canvas
- [x] Comprehensive test suite (types, store, serialization, data flow)

### Technology
- **Rendering**: Native HTML5 Canvas 2D API (no external drawing libraries)
- **State**: Zustand 4.5 with immutable updates
- **Styling**: Emotion CSS-in-JS + MUI v7 components
- **Integration**: ReactFlow custom node + property widget

---

## Defaults

| Setting | Default |
|---------|---------|
| Canvas size | 512 × 512 |
| Background color | #000000 |
| Brush | size=12, opacity=1.0, hardness=0.8, color=#ffffff |
| Pencil | size=1, opacity=1.0, color=#ffffff |
| Eraser | size=20, opacity=1.0, hardness=0.8 |
| Shape | stroke=#ffffff, width=2, filled=false, fill=#ffffff |
| Fill | color=#ffffff, tolerance=32 |
| Zoom | 1.0 (range 0.1–10) |
| History | max 30 entries |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Move tool |
| B | Brush |
| P | Pencil |
| E | Eraser |
| G | Fill |
| I | Eyedropper |
| L | Line |
| R | Rectangle |
| O | Ellipse |
| A | Arrow |
| M | Toggle mirror horizontal |
| [ / ] | Decrease / increase brush size |
| + / − | Zoom in / out |
| Delete / Backspace | Clear active layer |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+0 | Reset view (zoom + pan) |
| Ctrl+S | Export PNG |
| Alt+Click / Middle-click | Pan canvas |
| Scroll wheel | Zoom |

---

## Recommended Follow-ups

- Extract tool logic from SketchCanvas into modular tool classes (`tools/` directory)
- Add selection tools for copy/paste/transform workflows
- Add pressure sensitivity support for drawing tablets
- Add layer thumbnail previews in the layers panel
- Add drag-and-drop layer reordering
- Add custom palette save/load
- Add import PNG into layer
