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

> Goal: cover the most important features for daily use.

Reference parity note: sketch maps **C** → circle and **R** → rectangle; NodeTool uses **O** → ellipse/circle and **R** → rectangle. Features below use neutral names (ellipse/square) where it matters.

### Drawing tools (baseline + parity gaps)

| Tool                     | NodeTool today                                | Parity / gaps                                                                                                                                 |
| ------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Brush (B)                | Size, opacity, hardness, color                | [ ] **Pressure** from pointer events / tablet; [ ] optional **roundness** + **angle** (oval brush footprint)                                  |
| Pencil (P)               | Size 1–10, square caps, pixel-aligned strokes | [ ] True **1px anti-aliased pencil** mode (always 1px feel at any zoom)                                                                       |
| Line (L)                 | Free line + arrow                             | [ ] **Shift**: horizontal / vertical / 45° constraint while dragging                                                                          |
| Ellipse (O) (“circle”)   | Ellipse + fill options                        | [ ] **Shift**: **perfect circle** from bounding box                                                                                           |
| Rectangle (R) (“square”) | Rectangle + fill options                      | [ ] **Shift**: **perfect square**                                                                                                             |
| Fill (G)                 | Tolerance + color                             | Done (tune UX vs. reference)                                                                                                                  |
| Eraser (E)               | Size, opacity, hardness                       | Done                                                                                                                                          |
| Eyedropper (I)           | Samples composited canvas                     | Done                                                                                                                                          |
| Clone / copy brush       | —                                             | [ ] **Alt+click** (or chord) sets source; stroke copies pixels at offset — clone stamp; sample from composited or active layer only (specify) |
| Healing brush            | —                                             | [ ] Spot-heal / texture blend: sample region + paint destination with luminance/edge-aware mix (scope: “good enough” vs full Photoshop)       |

- [x] Shape tools: line, rectangle, ellipse, arrow
- [x] Shape settings: stroke color, stroke width, optional fill + fill color
- [x] Move / drag layer content tool (V shortcut)
- [x] Mirror drawing while painting — **horizontal** (**M**) + **vertical** (toolbar toggle)
- [ ] **Flip active layer** horizontal / vertical (destructive edit on layer pixels — distinct from mirror symmetry while drawing)
- [x] Clear active layer (Delete/Backspace shortcut + toolbar button)
- [x] Export canvas as PNG download (toolbar button)
- [ ] Selection tools (rectangle select, lasso, magic wand with photoshop style options)
- [ ] Crop tool
- [ ] Gradient tool / gradient fill
- [ ] Blur Brush
- [ ] **Clone / copy brush** — clone stamp: pick source point, paint copies along stroke; hardness/size/opacity; align with layer vs composited source (define UX)
- [ ] **Healing brush** — retouch by sampling nearby (or Alt+picked) texture and blending into brush area; optional content-aware backend later
- [ ] **Brush engine variants** (see “Brush types” below)

### Brush types (engine / presets)

> Today the brush is one radial gradient stamp. These items split **Round / Soft / Airbrush / Spray** into distinct behaviors or presets.

| Type     | Target settings            | Status                                                           |
| -------- | -------------------------- | ---------------------------------------------------------------- |
| Round    | Hardness, roundness, angle | [ ] Roundness + angle on stamp; hardness already                 |
| Soft     | Hardness, roundness, angle | [ ] Softer default falloff / separate preset from Round          |
| Airbrush | Flow, softness             | [ ] Low-flow accumulation (opacity buildup per dab / time)       |
| Spray    | Density                    | [ ] Particle scatter pattern (stochastic dots within brush disk) |

### Color system

- [x] Per-tool color + shared swatch strip (28 preset colors)
- [ ] **HSV color wheel** (hue ring + saturation/value square)
- [ ] **HSL / RGB sliders** + live numeric fields
- [ ] **Hex input** (`#RRGGBB`) validated in picker
- [ ] **Foreground / background** colors with **X** swap (and optional **D** = reset black/white, Photoshop-style)
- [ ] **User color presets** (e.g. 6–8 slots) **saved in `localStorage`** (separate from fixed palette)

### Layers (extra parity)

- [x] Multiple layers: add / delete / duplicate
- [x] Opacity, visibility, rename (double-click), reorder (buttons)
- [ ] **Merge down** / merge selected / flatten visible (pick one minimal set first)
- [ ] **Drag-and-drop layer reordering** (list reorder, not only up/down buttons)
- [ ] Group/folder layers
- [ ] **Segmentation → layers** — see Phase 3 **SAM / Segment Anything** (promote each mask to its own raster layer)

### Canvas & view

- [x] Custom width × height in document; default 512×512
- [ ] **Preset sizes** in UI: 512×512, 512×768, 768×512, 1024×1024, 1920×1080, **Custom…**
- [x] Zoom + pan (wheel, middle mouse, Alt+click pan per current implementation)
- [ ] Zoom to mouse position - see implementation in ImageViewer.tsx
- [ ] **Space + drag** to pan from any tool (drag also with middle mouse)
- [ ] **Toggle UI / panels** shortcut (**Tab**)

### UI & Interaction

- [x] Dark-mode MUI styling (follows nodetool app theme)
- [ ] Prevent shortcuts being applied to node editor while sketch editor is open
- [ ] improve Shortcuts reference panel in toolbar: slightly bigger font, toggle hidden
- [ ] **Panel layout persistence** (positions + collapsed state in `localStorage` or sketch session)
- [x] Tool-specific settings panels (dynamic per active tool)
- [ ] **Double-click tool icon** → open or focus that tool’s settings
- [x] Color swatches (28 preset colors)
- [x] Keyboard shortcuts — B/P/E/G/I/L/R/O/A/V/M, [/], +/−, Delete, Ctrl+Z/Y/0/S
- [x] Brush cursor preview (size indicator on canvas)
- [ ] add context-sensitive right click menu for tools like draw, select, etc.

### Gesture shortcuts **shortcut conflicts**

| Reference    | Intent            | NodeTool plan                                                                                                                                       |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S** + drag | Adjust brush size | [ ] Implement as **canvas drag while S held** (do **not** steal **Ctrl+S** save).                                                                   |
| **O** + drag | Adjust opacity    | [ ] **Conflict:** **O** selects **ellipse** tool. Use **Alt+O** / **Shift+O** / or drag on **opacity slider ring** only — decide in implementation. |
| **X**        | Swap FG/BG        | [ ] After FG/BG color model exists.                                                                                                                 |
| **Space**    | Hide all panels   | [ ] Only if pan does not use Space alone; prefer **Space+drag = pan** and **Tab** for panel visibility if that matches app norms.                   |

### Persistence & Export

- [x] Autosave on every stroke
- [x] PNG export download from toolbar (Ctrl+S)

### Node behavior & SketchInput

- [x] Preview thumbnail on node
- [x] Real-time output updates during editing
- [x] Output: flattened **image** + **mask** (PNG / data URL pipeline)
- [x] Input image auto-loading with canvas resize
- [ ] **Node / property widgets:** optional **canvas preset** dropdown + **custom W×H**
- [ ] **Node / property widgets:** **initial background** preset — **black / white / gray** (today: configurable `backgroundColor`, expose as quick presets)
- [ ] Fix input image not showing up as layer
- [ ] Cleaner node UI styling refinements

---

## Phase 3: Advanced Parity / Extensibility 📋

> Goal: add higher-complexity features without destabilizing the foundation.

- [ ] Add Photoshop-style shortcuts **only where the feature exists** — update the “Keyboard Shortcuts” section and the Photoshop appendix as features ship (see Phase 2 gesture parity + conflicts).
- [ ] Selection tools with transform (scale, rotate, skew)
- [ ] Vector/pen tool
- [ ] Text layers with font settings
- [ ] Advanced brush system — **pressure, tilt, velocity dynamics** (extends Phase 2 brush types / Round–Spray table)

### SAM / Segment Anything → layers

> Requires a **segmentation backend** (Python job, preferably local model, or Replicate/FAL/HF). The sketch UI orchestrates prompts and turns masks into document layers.
> stretch goal: Optional output mode: promote each segment as a full raster layer (cropped or full-canvas with transparency) so you get separated image data per region, not only grayscale/alpha masks.

- [ ] Run **SAM** (or API-compatible successor) on **composited canvas** and/or **input image** — support prompt modes the backend allows: **points** (+/−), **box**, optional **auto / everything** masks
- [ ] **Promote segments to layers** — each chosen mask becomes a **new raster layer** (filled region or cut-out with transparency); sensible default names (`Segment 1`… or label from class if available)
- [ ] **Overlay UX** — hover/select candidate regions, toggle visibility, merge two segments before commit, discard slivers (min area threshold)
- [ ] **Commit strategies** — **add layers** vs **replace non-base layers**; never drop locked **input_image** base without confirmation
- [ ] **Integration** — job progress/errors in modal; cache last result for re-pick; document **latency, cost, and auth** (same patterns as other AI nodes in nodetool)

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

| Setting          | Default                                                      |
| ---------------- | ------------------------------------------------------------ |
| Canvas size      | 512 × 512                                                    |
| Background color | #000000                                                      |
| Brush            | size=12, opacity=1.0, hardness=0.8, color=#ffffff            |
| Pencil           | size=1, opacity=1.0, color=#ffffff                           |
| Eraser           | size=20, opacity=1.0, hardness=0.8                           |
| Shape            | stroke=#ffffff, width=2, filled=false, fill=#ffffff          |
| Fill             | color=#ffffff, tolerance=32                                  |
| Zoom             | 1.0 (range 0.1–10 today; consider 0.25–8× parity in Phase 2) |
| History          | max 30 entries                                               |

---

## Keyboard Shortcuts

| Key                      | Action                         |
| ------------------------ | ------------------------------ |
| V                        | Move tool                      |
| B                        | Brush                          |
| P                        | Pencil                         |
| E                        | Eraser                         |
| G                        | Fill                           |
| I                        | Eyedropper                     |
| L                        | Line                           |
| R                        | Rectangle                      |
| O                        | Ellipse                        |
| A                        | Arrow                          |
| M                        | Toggle mirror horizontal       |
| [ / ]                    | Decrease / increase brush size |
| + / −                    | Zoom in / out                  |
| Delete / Backspace       | Clear active layer             |
| Ctrl+Z                   | Undo                           |
| Ctrl+Shift+Z / Ctrl+Y    | Redo                           |
| Ctrl+0                   | Reset view (zoom + pan)        |
| Ctrl+S                   | Export PNG                     |
| Alt+Click / Middle-click | Pan canvas                     |
| Scroll wheel             | Zoom                           |

### Planned (reference)

Not implemented yet — see Phase 2 **Gesture shortcuts** for **X**, **S+drag**, **O+drag** conflicts and proposed resolutions.

| Key / gesture                | Planned action                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| X                            | Swap foreground / background (needs dual color model)                                                                   |
| S + drag on canvas           | Adjust brush (or active paint tool) size                                                                                |
| O + drag                     | Adjust opacity — **conflicts with O = ellipse**; needs alternate chord                                                  |
| Space + drag                 | Pan (if unified with reference)                                                                                         |
| Tab or Space (tap)           | Hide toolbars / panels (choose one; avoid breaking pan)                                                                 |
| Shift (while drawing shapes) | Constrain line angles; square / circle bounds                                                                           |
| J                            | Healing brush — when implemented                                                                                        |
| (TBD)                        | Clone / copy brush — **avoid bare `S`** (conflicts with **Ctrl+S** export + **S+drag** size); e.g. **K** or **Shift+S** |

---

## Keyboard Shortcuts from photoshop

> Mac users: swap `Ctrl` → `Cmd` and `Alt` → `Option`

---

### Selection

| Shortcut           | Action                        |
| ------------------ | ----------------------------- |
| `M`                | Marquee tool (rect / ellipse) |
| `L`                | Lasso tool                    |
| `W`                | Magic Wand / Quick Select     |
| `Ctrl + A`         | Select all                    |
| `Ctrl + D`         | Deselect                      |
| `Ctrl + Shift + I` | Invert selection              |
| `Ctrl + Shift + D` | Reselect last selection       |
| `Shift + drag`     | Add to selection              |
| `Alt + drag`       | Subtract from selection       |
| `Alt + S`          | Select subject (AI)           |

---

### Move & Transform

| Shortcut           | Action                |
| ------------------ | --------------------- |
| `V`                | Move tool             |
| `Ctrl + T`         | Free Transform        |
| `Enter`            | Confirm transform     |
| `Esc`              | Cancel transform      |
| `Shift + drag`     | Constrain proportions |
| `Ctrl + Shift + T` | Repeat last transform |
| `Arrow`            | Nudge 1px             |
| `Shift + Arrow`    | Nudge 10px            |

---

### Painting & Drawing

| Shortcut        | Action                              |
| --------------- | ----------------------------------- |
| `B`             | Brush tool                          |
| `P`             | Pen tool                            |
| `S`             | Clone Stamp                         |
| `J`             | Healing Brush / Spot Heal           |
| `[`             | Decrease brush size                 |
| `]`             | Increase brush size                 |
| `Shift + [`     | Decrease hardness                   |
| `Shift + ]`     | Increase hardness                   |
| `0–9`           | Set brush opacity (0–100%)          |
| `Shift + 0–9`   | Set brush flow                      |
| `X`             | Swap foreground / background colors |
| `D`             | Reset to black / white              |
| `Alt + click`   | Eyedropper — sample color           |
| `Shift + paint` | Straight line stroke                |

---

### Erasing & Filling

| Shortcut                   | Action                       |
| -------------------------- | ---------------------------- |
| `E`                        | Eraser                       |
| `G`                        | Gradient / Paint Bucket      |
| `Alt + Backspace`          | Fill with foreground color   |
| `Ctrl + Backspace`         | Fill with background color   |
| `Shift + F5`               | Fill dialog (Content Aware…) |
| `Ctrl + Shift + Backspace` | Fill & preserve transparency |

---

### View & Navigation

| Shortcut       | Action             |
| -------------- | ------------------ |
| `Z`            | Zoom tool          |
| `H`            | Hand (pan)         |
| `Ctrl + +`     | Zoom in            |
| `Ctrl + -`     | Zoom out           |
| `Ctrl + 0`     | Fit on screen      |
| `Ctrl + 1`     | 100% actual pixels |
| `Space + drag` | Pan (any tool)     |
| `Tab`          | Hide / show panels |
| `F`            | Cycle screen modes |
| `Ctrl + ;`     | Show / hide guides |

Mac users — swap Ctrl → Cmd and Alt → Option throughout.
Brush size/hardness ([ ] and Shift+[ ]) are the ones you'll muscle-memory fastest — they work with Eraser and Clone Stamp too, not just the Brush.
Holding Space temporarily switches to the Hand tool from any tool, which is handy for quick panning while painting without breaking your flow.
Alt+click for eyedropper works mid-stroke while the Brush is active — you don't need to switch to the eyedropper tool at all.

## Recommended Follow-ups

- Extract tool logic from SketchCanvas into modular tool classes (`tools/` directory)
- Retouch tools: **clone/copy brush**, **healing brush** (see Phase 2); wire shortcuts without clashing **S**
- SAM / segmentation: backend job + **masks → new layers** (see Phase 3)
- Add selection tools for copy/paste/transform workflows
- Layer thumbnail previews in the layers panel
- Import PNG into layer / new layer
- Items now tracked in Phase 2: DnD layer reorder, user color presets (`localStorage`), preset canvas sizes, merge layers, full color wheel + hex/RGB/HSL, panel layout persistence

### Backlog candidates (worth tracking — not in Phase 2/3 yet)

- [ ] **Alt + click / long-press** temporary eyedropper while Brush/Pencil/Eraser is active (Photoshop-style; reduces tool switching)
- [ ] **Keyboard shortcut for vertical mirror** — today **M** toggles horizontal only; vertical is toolbar-only
- [ ] **Touch / tablet**: pinch-zoom, two-finger pan; optional palm rejection hooks
- [ ] **Pixel workflow**: optional pixel grid overlay, snap-to-pixel, nearest-neighbor view at high zoom
- [ ] **Rulers + draggable guides** (pairs with Photoshop “View” appendix; useful for layout-heavy masks)
- [ ] **Performance guardrails**: max canvas megapixels warning; history memory estimate or cap by pixel count; throttle compositing on huge documents
- [ ] **Accessibility**: focus trap + `Esc` closes modal consistently; visible focus in layer list; screen-reader labels on tools
- [ ] **QA**: Playwright (or RTL) smoke test — open sketch from node, draw stroke, assert serialized output / no graph shortcut bleed
- [ ] **Export options**: explicit “PNG with alpha” vs opaque flatten; optional JPEG for lighter previews

### Krita-inspired candidates (high-signal for masks & painting)

Krita is a full painting app; these are the ideas that tend to matter most for **clean masks, iteration speed, and texture-style outputs** without copying the whole product.

- [ ] **Stroke stabilizer / lazy smoothing** — damp pointer jitter (especially tablets); strength slider
- [ ] **Rotate canvas (view only)** — spin the _viewport_ for a comfortable wrist angle; does not bake rotation into pixels until export if undesired
- [ ] **Wrap-around / tiling mode** — draw with edges wrapping so seams stay continuous (tiles, patterns, seamless textures for downstream nodes)
- [ ] **Alpha lock** (“lock transparency”) per layer — brush/fill only where pixels already exist; essential for refining masks without growing halos
- [ ] **Isolate / solo layer** — temporarily show only the active layer against checkerboard (or dim others) for edge cleanup
- [ ] **Pop-up palette** (radial HUD) — quick color + tool/size picks via shortcut or right-click; optional `localStorage` for recent colors
- [ ] **Smudge / color-smudge brush** — push/blend existing pixels (distinct from blur-everything brush); pairs with mask cleanup and painterly strokes
- [ ] **Extended symmetry** — optional N-fold rotational symmetry or multi-point mirror (beyond current H/V mirror while drawing)
- [ ] **Gamut / color sanity in picker** — optional “limit to sRGB slice” or warn when color is out of gamut for 8-bit export (lower priority)

## Target UX tips (workflow parity)

These mirror common guidance but apply to **SketchInput** / **SketchProperty** in the workflow editor:

- Double-click a tool (when implemented) to jump straight to its settings.
- Use lower hardness and airbrush-style flow (once Airbrush exists) for soft shading.
- Separate elements on layers early; merge down only when composition is final.
- Use **S+drag**-style size gestures once implemented for faster brush changes without opening sliders.
- Prefer **Tab** (or an agreed shortcut) to maximize canvas when reviewing the full composition.
- Dark UI follows the app theme; optional sketch-local theme toggle is a Phase 2 item.

# FEATURE IDEAS / STRETCH GOALS

- [ ] Multiple canvases/documents
- [ ] Palettes / custom swatch management (save/load palettes)
- [ ] Richer project operations (save/load/templates)
- [ ] PSD/ORA compatibility import/export
- [ ] 3D layer support
- [ ] Clipping masks / clipping groups
- [ ] Layer effects / filters (blur, sharpen, etc.)
- [ ] Custom plugin / tool extensibility system
- [ ] Better project persistence (localStorage backup / file export)
- [ ] Import PNG into current layer
- [ ] Export project file (JSON + embedded images)
- [ ] SVG import/export
- [ ] SAM / Segment Anything (or equivalent) → **automatic layer split** from segmentation masks

(See Phase 2 for sketch-local theme toggle and draggable/collapsible panels — avoid duplicating here.)
