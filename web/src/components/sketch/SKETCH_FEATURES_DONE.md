## Appendix: Shipped — Phase 1 (MVP)

> Goal delivered: stable editor foundation with image + mask output.

### Editor Shell

- [x] Fullscreen modal editing (SketchModal with z-index portal)
- [x] Main editor composition: Toolbar | Canvas | Layers Panel
- [x] Dark-mode MUI styling (follows nodetool theme)

#### UI & interaction

- [x] Prevent shortcuts from firing in the node editor while the sketch modal is open
- [x] **Improve** shortcuts reference panel (slightly larger font, collapsible)
- [x] **Panel layout persistence** (collapsed state in `localStorage`)
- [x] **Collapsible toolbar sections** (Colors, Settings, Actions, Swatches, View, Shortcuts)
- [x] **Unified tool grouping** (all tools in one section, shapes below draw tools)
- [x] move from left to right panel: Canvas Size, Shortcuts. align those 2 items on bottom
- [x] improve **Context-sensitive** right-click menu: add quick options for currently active tool
- [x] **Sketch command palette** (canvas right-click) — redesigned as the primary in-canvas hub: dark-theme 3-column layout, compact quick controls, icon-forward tool switcher, and canvas actions
- [x] improve **Context-sensitive menu** right-click menu: refactor layout: left side for active tool, right for tool selection
- [x] improve **Context-sensitive menu** bolder design, focus on usability. intuitive menu that can control most features in a quick way.
- [x] improve **Color Select Buttons** hex, rgb, hsl buttons — bolder, larger, better contrast selected state
- [x] improve **Color Select Buttons** allow holding mouse pressed and drag over swatches to preview colors; release to confirm. Also works on user preset swatches.
- [x] adjustments for brightness, contrast, saturation without apply button - apply directly on change with small debounce like 100ms
- [x] **fix undo history** layer structure changes (add/remove/duplicate/reorder/visibility/opacity/blend mode/rename/mask/alpha lock) now captured in undo history with full layer structure snapshots

### Painting & Drawing Tools

- [o] Add `S` for clone stamp.
- [o] Add `J` for healing brush / spot heal.
- [o] Add `Shift + 0–9` to set brush flow.
- [x] Brush tool — size (1–200), opacity (0–1), hardness (0–1), color picker
- [x] Pencil tool — size (1–10), opacity (0–1), color picker
- [x] Eraser tool — size (1–200), opacity (0–1), hardness (0–1)
- [x] Flood fill tool — color picker, tolerance (0–128)
- [x] Eyedropper / color sampler — samples from composited canvas
- [x] improve Blur brush: fixed hard edges by using circular radial-gradient mask blending
- [x] Crop tool (C key, drag to select crop region)
- [x] Gradient tool / gradient fill (T key, linear + radial, drag to draw)
- [x] Adjustment section with sliders for: brightness, contrast, saturation (collapsible panel with Apply button)
- [x] **Brush engine variants** (see **Brush types** below)
- [x] **Straight Lines for drawing with Brushes, Eraser** draw straight lines when holding SHIFT key and clicking. Fixed: capture-phase key listeners so Shift key state is properly tracked.
- [x] **Eraser** paints transparent (uses `destination-out` composite operation). Erased areas reveal the canvas background color — this is correct behavior matching Photoshop.
- [x] **Performance** rAF-batched redraw coalesces layer compositing during active drawing (one redraw per animation frame instead of per pointer move event); reduces jank on large canvases
- [x] **Performance** blur tool: cached temporary canvases (avoids 3 canvas allocations per pointer move); checkerboard: cached as
- [x] Add `B` for brush tool.
- [x] Add `P` for pencil tool.
- [x] Add `[` to decrease brush size.
- [x] Add `]` to increase brush size.
- [x] Add `Shift + [` to decrease hardness.
- [x] Add `Shift + ]` to increase hardness.
- [x] Add `0–9` to set brush opacity.
- [x] Add `X` to swap foreground / background colors.
- [x] Add `D` to reset colors.
- [x] Add `Alt + click` eyedropper sampling while staying on current tool.
- [x] Add `Shift + paint` straight-line stroke behavior.

#### Brush types (engine / presets)

> Brush type selector (Round / Soft / Airbrush / Spray) in toolbar. Each type has distinct drawing behavior.

| Type     | Target settings            | Status                                                        |
| -------- | -------------------------- | ------------------------------------------------------------- |
| Round    | Hardness, roundness, angle | [x] Default; hardness controls falloff; [x] roundness + angle |
| Soft     | Hardness, roundness, angle | [x] Softer default falloff (hardness capped at 0.3)           |
| Airbrush | Flow, softness             | [x] Low-opacity radial dab accumulation per point             |
| Spray    | Density                    | [x] Particle scatter (stochastic dots within brush disk)      |

### Undo / Redo

- [x] Undo/redo with full layer snapshots (max 30 entries)
- [x] Keyboard: Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo)
- [x] Branching: future history cleared on new action after undo

### Canvas + view

- [x] Zoom 2x faster (factor changed from 1.15 to 1.3)
- [x] canvas size: set with presets and custom — Canvas Size section in toolbar with preset buttons and custom W×H inputs
- [x] **Preset sizes** in UI: 512×512, 512×768, 768×512, 1024×1024, 1920×1080, **Custom…**
- [x] **Space + drag** to pan from any tool (in addition to middle mouse)
- [x] **Toggle UI / panels** shortcut (**Tab**)

### Layers

- [x] **Flip active layer** horizontal / vertical (destructive; distinct from mirror-while-drawing)
- [x] Multiple layers with add / delete / duplicate
- [x] Layer visibility toggle (eye icon)
- [x] Layer reorder (move up / move down buttons)
- [x] Layer renaming (double-click inline edit)
- [x] Layer opacity slider (0–100% per layer)
- [x] Layer blend modes — 12 modes: normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion
- [x] Mask layer designation toggle + mask export
- [x] Layer locked state support
- [x] Active layer highlighting in panel
- [x] **Merge down** / merge selected / flatten visible
- [x] **Drag-and-drop layer reordering**: vertical drag with drop indicator
- [x] **Layer thumbnails**: small preview images in layers panel
- [x] **Alpha lock per layer**: lock transparency — painting only affects existing opaque pixels (🔒 indicator)
- [x] **Isolate / solo layer**: solo button per layer in layers panel — shows only the soloed layer on canvas; toggle again to show all
- [x] new layers are created as transparent by default. Layer color presets (transparent, black, white, gray) available as buttons in the layers panel.
- [x] the layer colors [transparent], BLACK, WHITE, GRAY are in right panel in first row with the + to add a new layer — shown as color swatches, no text
- [x] improved mask button icon in right panel (uses Gradient icon instead of Masks icon for better visual clarity)

### Input Image

- [x] Optional `input_image` loading into base layer (via SketchNode connections)
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

## Appendix: Shipped — Phase 2 (to date)

### Drawing & export

- [x] Shape tools: line, rectangle, ellipse, arrow
- [x] Shape settings: stroke color, stroke width, optional fill + fill color
- [x] **Shift** constraints — line (H/V/45°); ellipse (perfect circle); rectangle (perfect square)
- [x] Move / drag layer content tool (**V**)
- [x] Mirror drawing while painting — horizontal (**M**) + vertical (toolbar)
- [x] **Flip active layer** horizontal / vertical
- [x] Clear active layer (Delete/Backspace + toolbar)
- [x] Export canvas as PNG download (toolbar + Ctrl+S)
- [x] Autosave on every stroke

#### Color system

- [x] Per-tool color + shared swatch strip (28 preset colors)
- [x] **Hex input** (`#RRGGBB`) in picker
- [x] **Foreground / background** colors with **X** swap (optional **D** = reset black/white)
- [x] Color modes as button group with 3 buttons for RGB, HEX, HSL. also bigger.
- [x] fix HEX, RGB, HSL buttons not showing color input — each mode now shows its own input fields (hex text input, R/G/B number fields, H/S/L number fields)
- [x] make the default palette nicer: 7 rows × 7 columns — 1 gray row (black→white) + 6 hue rows (red, orange, green, cyan, blue, purple) with dark-to-light variations
- [x] add alpha support. also for gradients

### Layers

- [x] Multiple layers: add / delete / duplicate
- [x] Opacity, visibility, rename (double-click), reorder (up/down buttons)
- [x] **Merge down** / merge selected / flatten visible

### Canvas & view

- [x] Custom width × height in document; default 512×512
- [x] **Preset sizes** in UI (512×512, 512×768, 768×512, 1024×1024, 1920×1080, Custom…)
- [x] Zoom + pan (scroll wheel, middle mouse, Alt+click pan)
- [x] **Space + drag** pan from any tool
- [x] **Tab** toggles sketch UI / panels

### UI

- [x] Dark-mode MUI styling (follows app theme)
- [x] Tool-specific settings panels (per active tool)
- [x] Keyboard shortcuts — B/P/E/G/I/L/R/O/A/V/M, Tab, X, Space+drag, Shift (shapes), [/], +/−, Delete, Ctrl+Z/Y/0/S
- [x] Brush cursor preview on canvas
- [x] Shortcuts do not propagate to the node editor while the sketch modal is open
- [x] **Collapsible toolbar sections** with `localStorage` persistence (Colors, Settings, Actions, Swatches, View, Shortcuts)
- [x] **Unified tool grouping** (Move, Draw, and Shape tools in one "Tools" section)
- [x] **Improved shortcuts reference** (larger font, bold keys, collapsible — collapsed by default)
- [x] **Gradient tool** (T key) — linear + radial gradient fill between two drag points
- [x] **Crop tool** (C key) — drag to select crop region, resizes canvas + all layers
- [x] **Adjustment sliders** — brightness, contrast, saturation with Apply button (collapsible Adjustments section)
- [x] **Canvas info bar** — bottom-center overlay showing canvas dimensions + zoom %
- [x] **Right-click context menu** — tool switching, undo/redo, clear/export, tool presets (functional baseline; **visual redesign** = Phase 2 **Sketch command palette**)
- [x] **Smoother zoom** — symmetric 1.15x factor for wheel + button zoom
- [x] **Background presets** — black / white / gray quick buttons in Colors section
- [x] **S + drag brush size** — horizontal drag while S held adjusts brush/pencil/eraser/blur size
- [x] **Brush engine variants** — Round / Soft / Airbrush / Spray brush types with toolbar selector
- [x] **Improved blur brush** — circular radial-gradient mask for soft blending (no more hard edges)
- [x] **Alt+click eyedropper** — picks color while painting without switching tool (Photoshop convention)
- [x] **Shift+[ / Shift+]** — decrease / increase hardness for brush and eraser
- [x] **Number keys 0-9** — set brush/pencil/eraser opacity (0=100%, 1=10%…9=90%, Photoshop convention)
- [x] **Layer thumbnails** — small preview images of layer content in layers panel
- [x] **Alpha lock per layer** — lock transparency; painting only affects existing opaque pixels (🔒 indicator)
- [x] **Shift+M** — toggle vertical mirror (M = horizontal)
- [x] **Alt+Backspace / Ctrl+Backspace** — fill layer with foreground / background color (Photoshop convention)
- [x] **Stroke stabilizer** — moving-average smoothing (window=4) for brush strokes
- [x] **Fill layer with color** — canvas method + keyboard shortcuts for foreground/background fill
- [x] **Shift+click straight lines** — hold Shift and click to draw a straight line from the last stroke endpoint to the click point (Photoshop convention; works for brush, pencil, eraser, blur)
- [x] **Undo history for layer operations** — layer structure changes (add/remove/duplicate/reorder/visibility/opacity/blend mode/rename/mask/alpha lock) now captured in undo history with full layer structure snapshots
- [x] **Context menu two-column layout** — left side for active tool presets (size/opacity), right side for tool switching + actions; bolder header, section labels, shortcut hints
- [x] **Color mode buttons** — bolder HEX/RGB/HSL toggle buttons with improved contrast and selected state
- [x] **Pressure sensitivity** — read `PointerEvent.pressure` for brush/pencil/eraser; pressure affects size, opacity, or both (toggle + selector in toolbar)
- [x] **Brush roundness + angle** — elliptical brush footprints via `roundness` (0.1–1.0) and `angle` (0–360°) settings for Round/Soft brush types
- [x] **Rectangle selection tool** — marquee select with marching ants overlay; Escape deselects; Delete clears selection area on active layer
- [x] **Fix input image loading** — fixed stale document reference when opening editor; input image now reliably appears as locked base layer
- [x] **Layer color presets** — transparent / black / white / gray color swatch buttons in layers panel for quick layer creation with fill
- [x] **Improved mask icon** — replaced MasksIcon with GradientIcon for better visual clarity in layers panel
- [x] **Fix Shift+click straight lines** — fixed capture-phase key listener blocking; Shift/Space/S key tracking now works correctly alongside SketchEditor shortcuts
- [x] **Eraser uses destination-out** — confirmed eraser paints transparent (not black); erased areas reveal canvas background color as expected
- [x] **rAF-batched redraw** — pointer move redraws coalesced via `requestAnimationFrame` for smoother drawing on large canvases
- [x] **Blur tool cached canvases** — reuse temporary canvases for blur strokes instead of 3 allocations per pointer move
- [x] **Checkerboard pattern caching** — cached as `CanvasPattern` instead of per-pixel `fillRect` loops (262K calls → 1 call on 4K canvases)
- [x] **Isolate / solo layer** — solo button per layer in layers panel; canvas redraw skips non-isolated layers; toggle to return to all-layers view
- [x] **Color swatch hold-to-drag** — press and hold on a swatch, drag over others to preview colors in real-time, release to confirm
- [x] **Expose layer input/output** — per-layer "Expose Input" / "Expose Output" toggle buttons in layers panel; creates dynamic input/output handles on SketchNode using layer names; fixed composite output always present
- [x] **Cleaner SketchNode UI** — improved hover state with border highlight, edit overlay with "Edit Sketch" label, handle labels for exposed layers, rounded corners on content area
- [x] **Canvas border** — subtle white semi-transparent outline drawn after layer compositing to clearly show canvas boundaries at any zoom level
- [x] **Layer thumbnail transparency** — layer preview thumbnails now show a checkerboard pattern for transparent areas instead of solid black (CSS `repeating-conic-gradient`)
- [x] **Selection persists across tools** — marching ants selection overlay remains visible when switching to non-select tools and after shape/gradient/crop operations complete
- [x] **Deferred toDataURL for performance** — layer PNG encoding after each stroke is now deferred to the next animation frame via `requestAnimationFrame`, eliminating the small stutter after drawing
- [x] **Renamed to Image Editor** — user-visible text updated from "Sketch Input" / "Sketch Editor" to "Image Editor" across node header, modal title, property widget, and edit overlays
- [x] **Symmetry dropdown** — consolidated two separate mirror buttons into a single dropdown menu with Off / Horizontal (M) / Vertical (⇧M) / Dual Axis options; icon highlights when symmetry is active
- [x] **Selection movement** — drag inside an existing selection to reposition it without redrawing
- [x] **Selection add/subtract** — Shift+drag to add (union) a new rectangle to existing selection; Alt+drag to subtract from selection
- [x] **Delete respects selection** — Delete/Backspace key clears only the selected area on the active layer when a selection exists, otherwise clears the entire layer
- [x] **Selection constrains painting** — when a rectangular selection exists, brush, pencil, eraser, blur, clone stamp, and fill tools only affect pixels within the selection region (via canvas clip path)
- [x] **Invert selection (Ctrl+Shift+I)** — inverts selection to full canvas (approximation for rectangular selections)
- [x] **Reselect last selection (Ctrl+Shift+D)** — stores the last selection when deselecting; Ctrl+Shift+D restores it
- [x] **Improved brush cursor preview** — cursor now shows elliptical shape for non-default roundness and rotates for non-zero brush angle; uses `ctx.ellipse()` with save/restore transform
- [x] **Move tool padding fix** — increased move snapshot padding from 1x to 4x canvas max dimension, preserving layer content during large moves outside canvas bounds
- [x] **Color picker improvements** — added opacity/alpha slider with gradient rail, and old→new color comparison swatch strip at the bottom of the picker popover
- [x] **Extended symmetry modes** — added Radial and Mandala modes to symmetry dropdown with configurable ray count (2-12); `withMirror()` uses N-fold rotational math; consolidated mirror state from local SketchEditor state to Zustand store
- [x] **Dirty-rect compositing** — `requestDirtyRedraw(x, y, w, h)` clips compositing to the dirty region during painting, merges multiple dirty rects per animation frame, automatically falls back to full redraw for non-painting operations
- [x] **1px anti-aliased pencil** — pixel-grid snapping (`round(x-0.5)+0.5`) for crisp hairline strokes with consistent visual weight at any zoom level
- [x] **Move tool auto-pick layer** — Alt+click with the move tool scans layers top-to-bottom and switches to the first layer with a non-transparent pixel at the click point

#### Sketch command palette (canvas context menu)

- [x] The menu looks like a **designed tool palette**, not a default framework menu
- [x] A user can identify **active tool + key settings** within **~200 ms** of opening it
- [x] Brush / pencil / eraser controls are **shorter and clearer** than the previous row stack
- [x] Tool switching feels faster because the **Tools** section is recognition-based, not reading-based
- [x] The sections are easy to understand and remember: **current state / quick controls / tools / canvas** (with current state visually integrated rather than loudly labeled)
- [x] Common actions can be done with fewer eye movements between canvas, toolbar, and right panel

#### Node behavior & SketchInput

- [x] **Node / property widgets:** canvas **preset** dropdown + **custom W×H**
- [x] **Node / property widgets:** **initial background** quick presets — black / white / gray (`backgroundColor` already exists)
- [x] Fix input image not showing up as layer
- [x] add small buttons for "Expose input" and "Expose Output" to layers. this creates additional dynamic inputs and output handles in the node using the layer name. one fixed output always outputs the composite canvas.
- [x] Cleaner node UI styling — improved hover state, edit overlay with label, handle labels for exposed layers, rounded corners

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

### Architecture checklist (shipped)

- [x] Modular editor package under `web/src/components/sketch/`
- [x] Zustand store for state management
- [x] Typed, versioned serialized document format
- [x] Serialization utilities (JSON, flatten, mask export, image loading)
- [x] Thin nodetool integration wrappers (SketchProperty, SketchNode)
- [x] Canvas 2D rendering engine with layer compositing
- [x] Shape preview overlay canvas
- [x] Brush cursor preview canvas
- [x] Comprehensive test suite (types, store, serialization, data flow)
- [x] add `Layer.transform` and `contentBounds` to the document model
- [x] persist transform-aware layer data through serialization, history, export, and preview flows
- [x] render layers through transform-aware compositing instead of rewriting pixels on move/nudge
- [x] keep persistent layer-local raster bounds so off-canvas pixels can survive normal editing
- [x] move brush, pencil, eraser, and basic shape commit onto the shared paint-session model
- [x] track dirty rects and separate transient preview state from committed document state
- [x] restore layer previews and expose layers as input/output
- [x] ship core quality-of-life pieces already proven useful: alpha lock, symmetry modes, clone stamp basics, and trim-to-bounds

### Node / SketchInput

- [x] Preview thumbnail on node
- [x] Real-time output updates during editing
- [x] Output: flattened **image** + **mask** (PNG / data URL pipeline)
- [x] Input image auto-loading with canvas resize
- [x] Canvas **preset** dropdown + **custom W×H** on node / property widgets
- [x] **Background presets** — black / white / gray quick buttons in node / toolbar

---
