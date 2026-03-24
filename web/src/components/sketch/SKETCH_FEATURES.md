# Sketch Editor — Comprehensive Feature Checklist

> **Status**: Phase 1 complete
> **Last updated**: 2026-03-23

## General Note

- early development, all code can be changed and refactored when needed
- no backward compatibility or strict feature preservation needed - but ask if in doubt
- only run sketch related tests, not full tests

## Remaining work

### Phase 3 — in progress

## Core Layer Plan

> Goal: make layer movement and transforms lossless, serializable, and non-destructive while keeping the document canvas fixed.

[x] **Phase 1 — foundation:** introduce transform-aware layers with translate-first transform state, per-layer content bounds, and compatible history / serialization; render and export from layer pixels + transform instead of assuming every layer is a document-aligned raster.
[x] add `Layer.transform` and `contentBounds` to the document model with backward-compatible defaults
[x] persist transform-aware layer data through normalize / serialize / deserialize / history snapshots
[x] render layers through transform-aware compositing in editor preview
[x] apply transform-aware rendering to flatten/export paths
[x] make move and nudge update layer transform state instead of rewriting pixels

[ ] **Phase 2 — non-destructive editing pipeline:** keep transform edits separate from pixel edits, add reconciliation utilities that rasterize only when a paint operation truly requires it, and make undo/redo + invalidation aware of transform-only changes.
[ ] define transform-only vs pixel-edit transaction types and paint-space rules for layer-local vs reconciled editing
[x] add reconciliation / rasterize-on-demand path for painting into transformed layers
[ ] make undo/redo preserve transform-only edits correctly
[ ] update invalidation and redraw flow for transform-only changes
[ ] add regression tests for move, nudge, paint-after-move, and roundtrip serialization

[ ] **Phase 3 — stretch goals:** extend the transform model to full matrices for scale / rotate / free transform, add live non-destructive transform sessions with commit/cancel, and build higher-level workflows like trim-to-bounds and richer selection/layer transforms.
[ ] extend the translate-first transform model to a matrix-compatible structure
[ ] add live transform preview with commit / cancel flow
[ ] support scale / rotate / free transform on the shared layer model
[ ] add trim-to-bounds and richer selection/layer transform workflows

## Core Drawing Engine Priorities

[x] improve performance: defer `toDataURL` encoding to next frame to eliminate stutter after each stroke
[x] show transparency in layer previews — checkerboard pattern instead of black
[x] show a border around the canvas — subtle white outline marks canvas boundaries
[ ] centralize coordinate conversions between screen, viewport, canvas, layer-local, and selection space.
[x] track dirty rects and per-layer content bounds as first-class engine data.
[x] separate transient preview state from committed document pixel state.
[ ] treat each logical edit as one transaction with one history commit.
[ ] keep render math, hit testing, and compositing logic reusable outside React component wiring.
[ ] share stroke infrastructure where tool behavior truly overlaps, instead of forcing every tool through one identical pipeline.
[ ] make brush sampling, interpolation, spacing, and pressure mapping explicit and deterministic.
[ ] add composited-preview caching and explicit invalidation only after the transform-aware layer model is stable.
[ ] extract remaining tool engines from `SketchCanvas` into focused modules with shared constraints and utilities. [mostly done]

## Later / Product Tasks

[ ] add first-class support for `reference`-style image-backed layers with source, crop, transform, and IO metadata.
[ ] improve the round cursor drawing preview: always show correct size and rotation of draw tools, etc. currently too big.
[ ] ##Move Tool## add option to move another layer directly with hit mask when using move tool with modifier key
[ ] ##Rename Editor and Node## rename to "Image Editor" instead of "Sketch Input"

## Risks / Notes

- do not over-commit to a single universal stroke pipeline if shape tools and paint tools need different internals.
- preview caching is valuable, but adding it before the new layer model settles will cause churn.
- immediate priority: transform state, content bounds, coordinate spaces, and history semantics.
- do not break existing simple raster-layer workflows while introducing transform-aware layers.
- keep the default case cheap: ordinary document-aligned raster layers should not pay a large complexity or performance cost.
- keep the document canvas fixed for this effort; allow off-canvas layer content, but clip only at render/export boundaries.

---

> Goal: strong base for common sketch / mask workflows.

#### Drawing tools — gaps

- [x] Implement true `1px` anti-aliased pencil mode with consistent visual weight at any zoom level (pixel-grid snapping for crisp hairlines).
- [x] Add shape drawing from center with modifier keys: `Alt` draws from center, `Shift+Alt` draws from center with square/circle constraints.
- [x] Define clone stamp sampling mode: `active layer only` vs `composited image`.
- [x] Implement clone stamp source picking with `Alt+click` or equivalent chord.
- [x] Implement clone stamp offset tracking between source point and paint point.
- [x] Implement clone stamp stroke rendering that copies pixels through the normal brush pipeline.
- [x] add Delete key to delete layer content and respect selected tool selection when deleting

- [x] **FIX ADJUSTMENTS** see how ImageEditor.tsx did this. currently slow, not working
- [x] **Canvas show transparency as grid** currently shows black, but should be grid for alpha
- [x] **Performance** dirty-rect compositing for 2K-4K canvases: `requestDirtyRedraw()` clips compositing to changed region during painting, automatic merge of dirty rects per frame, full-redraw fallback for non-painting ops
- [x] **Improve Moving Tool** increased move snapshot padding to 4x canvas size to preserve content during large moves out of canvas bounds
- [x] **Symmetry** consolidated mirror buttons into one icon that opens dropdown with options: OFF, Horizontal, Vertical, Dual Axis. Icon shows if symmetry is active.
  - [x] add extended symmetry modes: Radial and Mandala (from original list: Diagonal, Wave, Circle, Spiral, Parallel omitted for simplicity)
  - [x] radial + mandala option for ray amount from 2-12 (slider in symmetry dropdown)

#### Selection Tool

- [x] make Selection as a first-class editing surface (not only marquee) - e.g. draw, eraser only inside selections when selection exists
- [ ] Selection tools: add lasso and magic wand with Photoshop-style options.
- [ ] make sure selection is per pixel and not just a shape. find good way to store with alpha, probably as a selection texture
- [ ] improve / add feather settings to selections

- [x] Selection should still be visible with other tools selected — overlay persists across tool switches and after shape/gradient/crop operations
- [x] Deselect with CTRL+D
- [x] allow to move selection
- [x] allow to add to and subtract from selection with modifier keys SHIFT is add, ALT is remove

#### Color system

- [ ] fix: foreground color only used after explicitly changing and pressing ok. e.g. swap colors does use old color
- [ ] make color picker and user palettes global for nodetool
- [ ] refactor color picker: use color wheel as in krita - an outer ring with square inside for brightness and saturation
- [ ] bring back predefined palette
- [ ] current standard swatch and user swatch at bottom of canvas (left of canvas pixel info which should be right aligned )
- [ ] show colors from image: store and show color swatch with up to 10 colors that were used for drawing

#### Layers

- [x] **Expose Layers** add buttons for expose as input / output per layer. create dynamic handles for node. see how dynamic nodes work
- [ ] **Use exposed inputs as Layers** make sure inputs show up as layers

- [ ] **Adjustment layers** (or equivalent non-destructive stack) — global per-layer adjustments without baking until flatten/export; pairs well with iterative AI and large canvases.
- [x] fix / restore layer previews without breaking performance
- [ ] Group / folder layers

#### Canvas & view

- [ ] make the canvas resizable from all borders and edges: drag to resize, show width/height while dragging, modifier keys for scaling from center

#### UI & interaction

- [x] improve **Color Select Buttons** — added opacity/alpha slider and old→new color preview swatch to the color picker popover

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
| S                        | Clone stamp tool                                 |
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
| Alt (shapes)             | Draw rectangle / ellipse from center             |
| [ / ]                    | Decrease / increase brush size                   |
| Shift+[ / Shift+]        | Decrease / increase hardness                     |
| 0–9                      | Set brush opacity (0=100%, 1=10%…9=90%)          |
| Alt+Click (paint tools)  | Eyedropper pick (stays on current tool)          |
| Alt+Click (clone stamp)  | Set clone stamp source point                     |
| Alt+Backspace            | Fill layer with foreground color                 |
| Ctrl+Backspace           | Fill layer with background color                 |
| Arrow keys               | Nudge active layer by 1px                        |
| Shift+Arrow keys         | Nudge active layer by 10px                       |
| + / −                    | Zoom in / out                                    |
| Delete / Backspace       | Clear active layer                               |
| Ctrl+Z                   | Undo                                             |
| Ctrl+Shift+Z / Ctrl+Y    | Redo                                             |
| Ctrl+0                   | Reset view (zoom + pan)                          |
| Ctrl+1                   | Zoom to 100% (actual pixels)                     |
| Ctrl+A                   | Select all                                       |
| Ctrl+D                   | Deselect                                         |
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
- [x] Add `Ctrl + A` for select all.
- [x] Add `Ctrl + D` for deselect.
- [x] Add `Ctrl + Shift + I` for invert selection.
- [x] Add `Ctrl + Shift + D` for reselect last selection.
- [x] Add `Shift + drag` to add to selection.
- [x] Add `Alt + drag` to subtract from selection.
- [ ] Add `Alt + S` for select subject.

### Move & Transform

- [x] Add `V` for move tool.
- [ ] Add `Ctrl + T` for free transform.
- [ ] Add `Enter` to confirm transform.
- [x] Add `Esc` to cancel active selection / transform-like interactions.
- [x] Add `Shift + drag` shape constraints for line, square, and circle drawing.
- [ ] Add `Ctrl + Shift + T` for repeat last transform.
- [x] Add `Arrow` keys to nudge by 1px.
- [x] Add `Shift + Arrow` keys to nudge by 10px.

### Painting & Drawing

- [x] Add `S` for clone stamp.
- [ ] Add `J` for healing brush / spot heal.
- [ ] Add `Shift + 0–9` to set brush flow.
- [ ] add freehand drawing with https://github.com/steveruizok/perfect-freehand

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
- [x] Add `Ctrl + 1` for 100% actual pixels.
- [x] Add `Space + drag` to pan from any tool.
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
└── __tests__/                # 16 test suites, 310+ tests
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
- [ ] **Canvas size from input layer** if input layers exist, one layer can be set to define canvas size. define clearer!?
- [ ] **Tonemapping**: add professional tonemapping section with 10 good presets
- [ ] **Pixel workflow**: pixel grid overlay, snap-to-pixel, crisp view at high zoom
- [ ] **Performance guardrails**: max megapixels warning; history memory cap by pixel count; throttle compositing on huge documents
- [ ] **AI Healing Brush**: add healing brush functionality that uses AI model. research and present plan before implementing.
- [ ] **Shader System**: draw and fill with webgpu shaders
- [ ] **Touch / tablet**: pinch-zoom, two-finger pan; optional palm rejection
- [ ] **Export options**: PNG with alpha vs opaque flatten; optional JPEG for previews
- [ ] **Rulers + draggable guides**
- [ ] **Support PSD file format** https://github.com/Agamnentzar/ag-psd

### Krita-inspired candidates

- [ ] **Add / improve Stroke stabilizer / lazy smoothing** — moving-average smoothing (window=4) for brush strokes: make smoothing adjustable
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
