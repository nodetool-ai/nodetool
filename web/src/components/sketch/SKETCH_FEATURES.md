# Sketch Editor — Comprehensive Feature Checklist

> **Status**: Phase 1 complete
> **Last updated**: 2026-03-22

## Remaining work

### Phase 2 — in progress

## Core Drawing Engine Priorities

[ ] keep one shared stroke pipeline for brush, pencil, eraser, blur, and shape preview/commit flow.
[ ] centralize coordinate conversions between screen, viewport, canvas, layer-local, and selection space.
[ ] track dirty rects and per-layer content bounds as first-class engine data.
[ ] cache composited previews and invalidate them explicitly on layer, visibility, blend, mask, isolate, and canvas-size changes.
[ ] separate transient preview state from committed document pixel state.
[ ] treat each logical edit as one transaction with one history commit.
[ ] extract tool engines from `SketchCanvas` into focused modules with shared constraints and utilities.
[ ] keep render math, hit testing, sampling, and compositing logic reusable outside React component wiring.
[ ] make brush sampling, interpolation, spacing, and pressure mapping explicit and deterministic.
[ ] add first-class support for `reference`-style image-backed layers with source, crop, transform, and IO metadata.
[ ] improve the round cursor drawing preview: always show correct size and rotation, etc.
[ ] improve performance: there is a small stutter every time after drawing a stroke
[ ] show transparency in layer previews - currently black instead of grid
[ ] show a border around the canvas
[ ] ##Move Tool## add option to move another layer directly with hit mask when using move tool with modifier key

---

> Goal: strong base for common sketch / mask workflows.

#### Drawing tools — gaps

- [ ] Implement true `1px` anti-aliased pencil mode with consistent visual weight at any zoom level.
- [x] Add shape drawing from center with modifier keys: `Alt` draws from center, `Shift+Alt` draws from center with square/circle constraints.
- [x] Define clone stamp sampling mode: `active layer only` vs `composited image`.
- [x] Implement clone stamp source picking with `Alt+click` or equivalent chord.
- [x] Implement clone stamp offset tracking between source point and paint point.
- [x] Implement clone stamp stroke rendering that copies pixels through the normal brush pipeline.
- [ ] Implement healing brush with sampled texture transfer plus simple luminance/color blending.
- [ ] Decide healing brush scope for v1 and document the exact behavior in the tool spec.
- [ ] add Delete key to delete layer content and respect selected tool selection when deleting

- [x] **FIX ADJUSTMENTS** see how ImageEditor.tsx did this. currently slow, not working
- [x] **Canvas show transparency as grid** currently shows black, but should be grid for alpha
- [ ] **Performance** further improvements needed for 2K - 4K canvases where brushes feel super slow. do web research to fix.
- [x] **Improve Moving Tool** moving layer out of canvas bounds should not crop it

#### Selection Tool

- [ ] make Selection as a first-class editing surface (not only marquee) - e.g. draw, eraser only inside selections when selection exists
- [ ] Selection tools: add lasso and magic wand with Photoshop-style options.
- [ ] Selection should stil be visible with other tools selected
- [ ] Deselect with CTRL+D, allow to move selection, allow to add to and subtract from selection

#### Color system

#### Layers

- [ ] **Layers** add buttons for expose as input / output per layer. create dynamic handles for node.
- [ ] **Adjustment layers** (or equivalent non-destructive stack) — global per-layer adjustments without baking until flatten/export; pairs well with iterative AI and large canvases.
- [ ] Group / folder layers

#### Canvas & view

#### UI & interaction

- [ ] improve **Color Select Buttons** hex, rgb, hsl buttons and stuff inside the picker

#### Sketch command palette (canvas context menu)

#### Node behavior & SketchInput

### Phase 3 — advanced

> Goal: higher-complexity features without destabilizing the foundation.

- [ ] Photoshop-style shortcuts **only where implemented** — keep **Keyboard Shortcuts** + **Photoshop appendix** sections in sync as tools ship
- [ ] Selection tools with transform (scale, rotate, skew)
- [ ] Vector / pen tool
- [ ] Text layers with font settings. global font system with 20 well selected google fonts.
- [ ] Advanced brush system — **pressure, tilt, velocity dynamics** (extends Phase 2 brush types)
- [ ] replace ImageEditor.tsx to use the new SketchEditor instead - ImageEditor can then be deleted

### Portable sketch documents

- [ ] **Export project file** — versioned bundle (JSON document + embedded layer images, or single zip); usable for backup, templates, and handoff between machines
- [ ] **Import / open project** — restore full layer stack from exported file
- [ ] **Resilience** — optional explicit backup (e.g. `localStorage` snapshot or “Download project”) beyond node autoserialize

### Compositing: clipping groups & adjustment layers

- [ ] **Clipping masks / clipping groups** — upper layers only affect pixels inside the base layer’s alpha (non-destructive silhouette painting)

### SAM: Segment Anything (layers from segmentation)

> **Plan:** [\_plans/feat-sam.md](_plans/feat-sam.md) — phasing, backend options, UI flow, open questions.

> Needs a **segmentation backend** (Python job, preferably local model, or Replicate / FAL / HF). Sketch UI runs prompts and turns results into document layers.

- [ ] Run **SAM** (or API-compatible successor) on **composited canvas** and/or **input image** — **points** (+/−), **box**, optional **auto / everything** (per backend)
- [ ] **Promote segments to layers** — each chosen region → **new raster layer**; default names (`Segment 1`… or class label if available)
- [ ] **Output mode (user choice):** **cut-out layers** (full-canvas RGBA per segment, transparency outside region) vs **mask-only layers** (alpha / mask emphasis) — same geometry, different pixel representation
- [ ] **Overlay UX** — hover/select candidates, merge segments before commit, discard small regions (min area)
- [ ] **Commit strategies** — **add layers** vs **replace non-base layers**; never remove locked **input_image** base without confirmation
- [ ] **Integration** — progress/errors in modal; cache last result; document **latency, cost, auth** (same patterns as other AI nodes)

## Keyboard Shortcuts

| Key                      | Action                                           |
| ------------------------ | ------------------------------------------------ |
| V                        | Move tool                                        |
| B                        | Brush                                            |
| P                        | Pencil                                           |
| E                        | Eraser                                           |
| G                        | Fill                                             |
| I                        | Eyedropper                                       |
| Q                        | Blur brush                                       |
| T                        | Gradient tool                                    |
| C                        | Crop tool                                        |
| L                        | Line                                             |
| R                        | Rectangle                                        |
| O                        | Ellipse                                          |
| A                        | Arrow                                            |
| M                        | Toggle mirror horizontal                         |
| Shift+M                  | Toggle mirror vertical                           |
| Tab                      | Toggle sketch UI / panels                        |
| X                        | Swap foreground / background                     |
| D                        | Reset colors to black / white                    |
| S (hold) + drag          | Adjust brush size                                |
| Space (hold) + drag      | Pan canvas                                       |
| Shift (shape tools)      | Constrain line (H/V/45°); square / circle bounds |
| [ / ]                    | Decrease / increase brush size                   |
| Shift+[ / Shift+]        | Decrease / increase hardness                     |
| 0–9                      | Set brush opacity (0=100%, 1=10%…9=90%)          |
| Alt+Click (paint tools)  | Eyedropper pick (stays on current tool)          |
| Alt+Backspace            | Fill layer with foreground color                 |
| Ctrl+Backspace           | Fill layer with background color                 |
| + / −                    | Zoom in / out                                    |
| Delete / Backspace       | Clear active layer                               |
| Ctrl+Z                   | Undo                                             |
| Ctrl+Shift+Z / Ctrl+Y    | Redo                                             |
| Ctrl+0                   | Reset view (zoom + pan)                          |
| Ctrl+S                   | Export PNG                                       |
| Alt+Click / Middle-click | Pan canvas (non-paint tools)                     |
| Scroll wheel             | Zoom                                             |
| Right-click              | Context menu                                     |

## Keyboard Shortcuts from photoshop

> Mac users: swap `Ctrl` → `Cmd` and `Alt` → `Option`

### Selection

- [ ] Add `M` for marquee tool.
- [ ] Add `L` for lasso tool.
- [ ] Add `W` for magic wand / quick select.
- [ ] Add `Ctrl + A` for select all.
- [ ] Add `Ctrl + D` for deselect.
- [ ] Add `Ctrl + Shift + I` for invert selection.
- [ ] Add `Ctrl + Shift + D` for reselect last selection.
- [ ] Add `Shift + drag` to add to selection.
- [ ] Add `Alt + drag` to subtract from selection.
- [ ] Add `Alt + S` for select subject.

### Move & Transform

- [x] Add `V` for move tool.
- [ ] Add `Ctrl + T` for free transform.
- [ ] Add `Enter` to confirm transform.
- [x] Add `Esc` to cancel active selection / transform-like interactions.
- [x] Add `Shift + drag` shape constraints for line, square, and circle drawing.
- [ ] Add `Ctrl + Shift + T` for repeat last transform.
- [ ] Add `Arrow` keys to nudge by 1px.
- [ ] Add `Shift + Arrow` keys to nudge by 10px.

### Painting & Drawing

- [ ] Add `S` for clone stamp.
- [ ] Add `J` for healing brush / spot heal.
- [ ] Add `Shift + 0–9` to set brush flow.

### Erasing & Filling

- [x] Add `E` for eraser.
- [x] Add `G` for paint bucket / fill tool.
- [x] Add `Alt + Backspace` to fill with foreground color.
- [x] Add `Ctrl + Backspace` to fill with background color.
- [ ] Add `Shift + F5` for fill dialog.
- [ ] Add `Ctrl + Shift + Backspace` to fill and preserve transparency.

### View & Navigation

- [x] Add `Ctrl + +` to zoom in.
- [x] Add `Ctrl + -` to zoom out.
- [x] Add `Ctrl + 0` to fit / reset view.
- [x] Add `Tab` to hide / show panels.
- [ ] Add `Z` for zoom tool.
- [ ] Add `H` for hand / pan tool.
- [ ] Add `Ctrl + 1` for 100% actual pixels.
- [ ] Add `Space + drag` to pan from any tool.
- [ ] Add `F` to cycle screen modes.
- [ ] Add `Ctrl + ;` to show / hide guides.

Mac users — swap Ctrl → Cmd and Alt → Option throughout.  
Brush size/hardness (`[` / `]` and Shift+`[` / `]`) apply to Eraser and Clone Stamp in Photoshop, not only Brush.  
Space+drag pan and Alt+click eyedropper are high-value patterns to consider when implementing clone/heal.

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
└── __tests__/                # 15 test suites, 291+ tests
```

### Integration Points

```
web/src/components/properties/SketchProperty.tsx   → Property widget
web/src/components/node/SketchNode/SketchNode.tsx  → Custom ReactFlow node
web/src/components/node/PropertyInput.tsx           → "sketch" type dispatcher
web/src/components/node/ReactFlowWrapper.tsx        → Node type registration
```

### Backlog candidates

- [x] **Alt + click** temporary eyedropper while Brush/Pencil/Eraser/Fill is active — picks color without switching tool
- [x] **Keyboard shortcut for vertical mirror** — **Shift+M** = vertical; **M** = horizontal
- [ ] **Tonemapping**: add professional tonemapping section with 10 good presets
- [ ] **Pixel workflow**: pixel grid overlay, snap-to-pixel, crisp view at high zoom
- [ ] **Performance guardrails**: max megapixels warning; history memory cap by pixel count; throttle compositing on huge documents
- [ ] **AI Healing Brush**: add healing brush functionality that uses AI model. research and present plan before implementing.
- [ ] **Shader System**: draw and fill with webgpu shaders
- [ ] **Touch / tablet**: pinch-zoom, two-finger pan; optional palm rejection
- [ ] **Export options**: PNG with alpha vs opaque flatten; optional JPEG for previews
- [ ] **Rulers + draggable guides**

### Krita-inspired candidates

- [x] **Stroke stabilizer / lazy smoothing** — moving-average smoothing (window=4) for brush strokes
- [ ] **Rotate canvas (view only)**
- [ ] **Wrap-around / tiling mode**
- [x] **Alpha lock** — painting only affects existing opaque pixels; lock transparency indicator in layers panel
- [x] **Isolate / solo layer**
- [ ] **Pop-up palette** (radial HUD)
- [ ] **Smudge / color-smudge brush**
- [ ] **Extended symmetry** (N-fold / multi-point)
- [ ] **Gamut hints** in picker (lower priority)

# FEATURE IDEAS / STRETCH GOALS

- [ ] Layer effects / filters (blur, sharpen, etc.)
- [ ] Import PNG into current layer
- [ ] Palettes / custom swatch management (save/load)
- [ ] PSD/ORA compatibility import/export
- [ ] Richer project operations (save/load/templates)
- [ ] Clipping masks / clipping groups
- [ ] 3D layer support
- [ ] Custom plugin / tool extensibility
- [ ] Better project persistence (`localStorage` backup / file export)
- [ ] Export project file (JSON + embedded images)
- [ ] Multiple canvases/documents
- [ ] SVG import/export
