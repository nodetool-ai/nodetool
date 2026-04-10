## Recently Shipped

- [x] **Blur tool**: fixed — now correctly applies effect on click and stroke (was silently no-op in WebGPU mode due to missing `invalidateLayer`)
- [x] **Clone Stamp tool**: fixed — now correctly renders on click and stroke (same `invalidateLayer` fix)
- [x] **Clone Stamp cursor feedback**: crosshair indicator now appears at the clone source position (set via Alt+click) while the tool is active

## Archived From Active Roadmap (2026-04-09)

These transform-core groundwork tasks were moved out of `SKETCH_FEATURES.md` once the remaining move/transform section was reordered around still-open work.

### Completed transform-core groundwork

- [x] [impl] extract shared gizmo-core viewport/document-to-screen conversion and overlay-canvas drawing helpers so `TransformTool.ts`, `MoveTool.ts`, and `CropTool.ts` stop carrying ad hoc mapping and paint setup
- [x] [impl] split `TransformTool.ts` further so drag/session orchestration, hover-hit policy, and gizmo paint/layout no longer live together in one class
- [x] [impl+test] add shared gizmo paint primitives for box outlines, square handles, circular rotation handles, and hover/active styling so transform gizmo rendering stops being hand-written inline
- [x] [impl+test] migrate `TransformTool.ts` to the shared gizmo core first, then adopt the same primitives in `MoveTool.ts` and `CropTool.ts` only where it simplifies code without forcing a shared gesture lifecycle
- [x] [test] add focused regression coverage for gizmo hit testing, hover cursor behavior, and redraw alignment during pan/zoom/live transform preview

### Completed follow-up hardening after gizmo core

- [x] [impl] extract a shared tool-runtime context builder so `usePointerHandlers.ts` and `tools/types.ts` stop maintaining parallel callback/ref contracts for the same tool surface
- [x] [impl+test] centralize preview-session lifecycle for start/update/commit/cancel/clear so `MoveTool.ts`, `TransformTool.ts`, and selection-move preview follow one cleanup and stale-preview contract
- [x] [impl+test] centralize selection overlay -> mask -> combine -> apply flow so `SelectTool.ts` stops repeating marquee/lasso/polygon/magic-wand finalization logic
- [x] [impl+test] add a shared modifier-intent layer for transform and selection semantics so tools consume semantic flags like `fromCenter`, `constrain`, and `combineMode` instead of interpreting raw modifier refs ad hoc
- [x] [test] add focused regression coverage for cancel/supersede/stale-session cleanup across preview tools so aborted gestures cannot leave stale gizmos, previews, or delayed selection commits behind

## Archived From Active Roadmap (2026-04-07)

These blocks were moved out of `SKETCH_FEATURES.md` so the active roadmap can stay focused on the next pending work from top to bottom.

### Completed Phase 1 package work

- [x] Package A — Core seam convergence
- [x] Package B — Dependent move/transform correctness
- [x] Package C — Proof and parity hardening
- [x] Package D — Refactor support

### Completed Phase 1 groundwork themes

- [x] shared coordinate mapping, preview/commit parity, and resolved-output seams landed
- [x] transformed-layer move/transform regression coverage landed
- [x] document-output rendering separated from display-only chrome
- [x] helper-tool sampling paths routed through shared coordinate contracts
- [x] targeted overloaded-file refactors landed for compositing, canvas actions, and pointer routing

### Completed active-roadmap sections moved out of the backlog

- [x] `1.3 - Harden layer canvas lifecycle`
- [x] `1.4 - Harden coordinate mapping`
- [x] `1.5 - Harden selection model`
- [x] `1.6 - Harden compositing and rendering`
- [x] `1.7 - Harden transform model`
- [x] `1.8 - Harden history and serialization`
- [x] `1.9 - Active feature work`
- [x] `1.10 - Targeted refactor phase for overloaded files`

### Completed Phase 2 fixes moved out of the active backlog

- [x] blur tool works for strokes, not only a single dab
- [x] duplicate layers renamed as `[layer name] copy N`
- [x] tool defaults adjusted to sane values
- [x] default brush smoothing assist disabled
- [x] eraser settings now only show controls relevant to the current erase mode

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

- [ ] Add `S` for clone stamp.
- [ ] Add `J` for healing brush / spot heal.
- [ ] Add `Shift + 0–9` to set brush flow.
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

### PHASE 1
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
- [x] spring-loaded move: hold Ctrl (Windows/Linux) or Cmd (Mac) to move layers without changing the selected tool or top tool bar; release to stop
- [x] Ctrl+Alt (Cmd+Option on Mac) + drag duplicates the active layer and moves the copy; Alt does not pan while Ctrl/Cmd is held
- [x] radial palette HUD with color circle and a triangle inside for brightness and saturation, gamut hints like in krita.


### PHASE 4 - ADVANCED FEATURES

- [x] rename the editor/node from "Sketch Input" to "Image Editor"
- [x] import image into current layer by drop from outside and paste command
- [x] add groupable layers as tree structure with drag and drop support, expand / close option
- [x] better cursor and pixel-workflow affordances such as thin white grid overlay when zoomed in, snap-to-pixel, and crisp high-zoom view
- [x] improve selection mask to be able to select 1 pixel width exactly on close zoom
- [x] make the canvas resizable from edges/corners with a solid interaction model


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

## Archived from `SKETCH_FEATURES.md` (2026-04-10)

Moved here so the active roadmap stays a short “what’s next” list. Task labels match the main file: `[impl]`, `[test]`, `[impl+test]`, `[test-first]`.

### Immediate `SketchEditor.tsx` Refactor Candidates (completed)

- [x] [impl] extract a dedicated editor lifecycle/controller hook so initial-document seeding, canvas-ready gating, autosave snapshotting, tool-transition side effects, and imperative modal actions stop living in one component body
  - **Done:** Extracted `useEditorLifecycle()` hook in `hooks/useEditorLifecycle.ts`. Owns canvas-ready gating, initial-document seeding (`useLayoutEffect`), autosave snapshotting (`useEffect`), tool-transition side effects (adjust/transform/segment tool switches), and canvas-resize-handle localStorage preference. SketchEditor component body is now focused on composition/layout.
- [x] [impl+test] extract shared tool-chrome wiring so `ConnectedToolTopBar` and `ConnectedContextMenu` stop carrying parallel store subscriptions and nearly identical tool-settings/action plumbing
  - **Done:** Extracted `useToolChromeActions()` hook in `hooks/useToolChromeActions.ts`. Both `ConnectedToolTopBar` and `ConnectedContextMenu` now call this single hook instead of maintaining 14 parallel `useSketchStore` subscriptions each for per-tool settings setters and selection actions. Added 5 regression tests proving stable references and isolation from viewport/document changes.
- [x] [impl] centralize active-tool color intent routing so toolbar and layers-panel foreground-color changes use one shared helper instead of duplicating the same `activeTool` -> settings update mapping
  - **Done:** Extracted `useColorIntentRouter()` hook in `hooks/useColorIntentRouter.ts`. Both `ConnectedToolbar` and `ConnectedLayersPanel` now call this single hook instead of maintaining identical duplicated `handleFgColorChange` callbacks. Removed 6 unused store subscriptions from each connected component.
- [x] [impl+test] replace the large `useSketchStore(...)` action grab-bag in `SketchEditor.tsx` with focused editor action bundles or selector hooks for history, layer, canvas, color, and session-control concerns
  - **Done:** Created `useEditorStoreActions.ts` with 5 focused bundle hooks: `useHistoryStoreActions()`, `useLayerStoreActions()`, `useCanvasStoreActions()`, `useColorStoreActions()`, `useSessionStoreActions()`. Replaced ~60 individual `useSketchStore((s) => s.someAction)` calls in SketchEditor with grouped bundle destructuring. Added 13 regression tests proving bundle completeness, reference stability, and cross-bundle isolation.
- [x] [test] add a regression test proving move/transform preview updates rerender transform UI consumers only, not `SketchEditor.tsx` or unrelated shell components
  - **Done:** Added `transformPreviewBoundaries.test.tsx` with 5 tests proving: preview updates do NOT rerender toolbar/layers-panel selectors; preview updates DO rerender transform consumers; rapid updates stay isolated; clearing preview only rerenders transform consumers.
- [x] [impl+test] centralize sketch layer source URI resolution so hydration/runtime code and non-sketch preview renderers stop duplicating `asset://` to `/api/storage/` handling in separate helpers
  - **Done:** Created `utils/resolveAssetUri.ts` as the single source of truth for `asset://` → `/api/storage/` resolution. Updated `useLayerHydration.ts` (sketch), `output/hooks.ts` (node output), `useNodeResultHistory.ts`, and `createAssetFile.ts` to use the shared utility. Also exported `isAssetUri()` helper.
- [x] [test] add regression coverage proving locked exposed-input layers hydrate and show move/transform preview before any brush stroke, including `asset://`-backed image references
  - **Done:** Added 3 tests in `transformPreviewBoundaries.test.tsx`: image-reference layer shows preview without brush stroke; locked layer with imageReference shows preview; `asset://` URI is preserved through document state for hydration.
- [x] [test] add focused regression coverage for tool-switch lifecycle rules so leaving `adjust`, `transform`, or `segment` still cancels, initializes, and preserves the correct preview/session state after the refactor
  - **Done:** Added 6 tests in `transformPreviewBoundaries.test.tsx`: switching from transform/move clears preview; switching between non-preview tools is clean; adjust/segment tool switches are clean; rapid tool switches preserve consistent state.
- [x] [impl+test] isolate transient editor-session ownership across `SketchEditor.tsx`, `SketchCanvas.tsx`, transform preview state, canvas-resize-handle preference, segmentation side effects, and shell-only refs behind a dedicated session layer so future tools stop extending multiple session seams at once
  - **Done:** Extracted `useEditorSession()` hook in `hooks/useEditorSession.ts`. Owns canvasRef, store action bundles (history, layer, canvas, color, session), narrow selectors (document, activeTool, transientMove), interaction tool derivation, live toolSettings ref, flush-before-undo ref wiring, and all composed action hooks (history, layer, canvas, color, segmentation, lifecycle). SketchEditor body now calls `useEditorSession()` and `useEditorCommands()` instead of assembling session state inline. Added 4 regression tests proving session API completeness, interaction tool derivation, bundle stability, and zoom/pan isolation.
- [x] [impl+test] unify displayed transform consumption for transform UI with the same transient preview owner used by compositing so `ConnectedToolTopBar` and `ConnectedContextMenu` stop depending on a parallel active-layer preview channel during drag
  - **Done:** Extracted `useTransformAdapter()` hook in `hooks/useTransformAdapter.ts`. Both `ConnectedToolTopBar` and `ConnectedContextMenu` (in `editor-shell/`) call this single hook instead of independently calling `useDisplayedActiveLayerTransform()` and separately wiring commit/cancel/reset callbacks through props. The hook provides `display` (scaleX, scaleY, rotation) and `actions` (onCommit, onCancel, onReset) as a unified model. Added 5 regression tests proving display state tracking, preview reflection, clear reset, action delegation, and memoization stability.
- [x] [impl] extract connected shell subscriber components (`ConnectedToolbar`, `ConnectedToolTopBar`, `ConnectedLayersPanel`, `ConnectedContextMenu`, `SketchCanvasPane`) into a dedicated editor-shell module so `SketchEditor.tsx` stops being both the editor root and the place where all shell/store subscriber wrappers live
  - **Done:** Moved all 5 connected shell components into `editor-shell/` with individual files and `editor-shell/index.ts` barrel export. SketchEditor imports from `./editor-shell` and focuses on session orchestration and layout composition. Added module export test.
- [x] [impl+test] extract an editor command-surface hook so keyboard-shortcut wiring, context-menu actions, segmentation bridge callbacks, free-transform entry, and imperative modal actions stop being assembled inline in `SketchEditor.tsx`; keep behavior identical and add focused regression coverage for the extracted command wiring
  - **Done:** Extracted `useEditorCommands()` hook in `hooks/useEditorCommands.ts`. Owns keyboard-shortcut wiring (delegates to `useEditorKeyboardShortcuts`), context-menu action callbacks (fill with foreground, new layer, layer via copy/cut, free-transform), segmentation bridge callbacks (run segmentation, clear prompts), and the imperative handle for modal header actions. SketchEditor calls `useEditorCommands()` and wires the returned callbacks to shell components. Added hook export tests.

### Active Roadmap — completed items (store hardening, bugs, selection mask)

- [x] **[BUG] Move/Transform live preview does not work at startup (before first brush stroke)**
  - **Symptom:** When the sketch editor first opens (especially with an imageReference/exposed-input layer as the active layer), using MoveTool or TransformTool shows the gizmo correctly and the gizmo DOES update while dragging, but the visible layer pixel content does NOT follow — it stays at its original position. After the user makes any brush stroke, the preview works correctly for the rest of the session.
  - **What works:** Layer is visible at startup; gizmo appears immediately when tool is selected; gizmo handles update in real time during drag; after any brush draw the preview moves the layer correctly; preview commit on pointer-up works.
  - **What does not work:** During a drag with MoveTool or TransformTool, the rendered layer pixels do not move while dragging — only the gizmo follows the pointer. This is only broken at startup, before any brush stroke is made.
  - **Likely area:** `useTransformPreviewComposite` / `compositeToDisplay` path in the startup/bootstrap state. The gizmo updating confirms `setLayerTransformPreview` IS being called and `activeLayerTransformPreview` store IS updating, so the failure is downstream: either the rAF-composite targets the wrong canvas, the preview map is empty at rAF time, or `applyTransformPreviews` is not reaching the WebGPU/Canvas2D render path. A `console.debug("[SketchPreview] applying transform preview", ...)` log has been added to `useTransformPreviewComposite` (dev-only) to trace whether the composite fires with the correct preview map and canvas target at startup.
  - **Fix applied (v2):** Replaced async `requestRedraw()` (rAF) with synchronous `redraw()` (via `syncRedrawRef`) in both `setLayerTransformPreview` and `clearLayerTransformPreview`. The rAF path silently no-ops when a prior rAF is already pending (`redrawRequestRef.current !== null`), which happens because `onDown` calls `clearLayerTransformPreview` → `requestRedraw()` before `onMove` fires. Synchronous redraw matches the path used by brush strokes via `redrawDirty`, guaranteeing immediate compositing on every preview update regardless of bootstrap state or pending rAFs. The original `invalidateLayerRef` GPU texture force-invalidation on first drag is kept.
- [x] fix: Selection mask tool is still slow, especially with bigger canvas. especiall adding + removing from mask. if this is a fundamental problem with cpu processing, propose a short plan in SKETCH_FEATURES.md file
  - **Done:** Added fast-path in `combineMasks()` for same-size/same-origin masks (the common case). Eliminates union buffer allocation + base copy; runs a single flat loop. Also added `TypedArray.subarray()+set()` row-bulk copies in the general path. See perf plan below.
- [x] fix: Invert with Selection mask active: inverts pixels at wrong position, outside masked area. Investigate if core features, refactor, helpers or comments can be strengtened to prevent this kind of problems
  - **Root cause:** `invertLayerColors()` used only `contentBounds.x/y` for layer→document mapping, ignoring the layer `transform.x/y` offset. Other mask operations (`clearLayerBySelectionMask`, `fillLayerBySelectionMask`) correctly use `getLayerCompositeOffset()` which includes both. Fixed by switching to `getLayerCompositeOffset()`. Regression tests added.
  - **Hardening:** All per-pixel selection-constrained operations should go through the shared `getLayerCompositeOffset()` helper. JSDoc comments updated to document the mapping chain.

#### Selection mask performance plan (archived)

- [x] [impl+test] store subscription hardening pass 1: make `SketchEditor.tsx`, `SketchModal.tsx`, and `hooks/useSketchStoreSelectors.ts` stop acting like broad subscription aggregators; hot state such as `zoom`, `pan`, `selection`, and similar fast-changing UI state should be consumed in the narrowest subtree that actually needs it
- [x] [impl+test] store subscription hardening pass 2: audit sketch UI props and split shell vs hot-path consumers so canvas/runtime overlays can subscribe to viewport and selection state without forcing toolbar, layers panel, modal chrome, or other editor shell pieces to rerender
- [x] [impl+test] store subscription hardening pass 3: stop returning fresh selector objects/functions from Zustand subscriptions in sketch hot paths; move object merging/derived view models behind local `useMemo` or focused child components so unrelated store writes do not invalidate whole subtrees
- [x] [impl+test] store subscription hardening pass 4: add focused regression coverage for sketch rerender boundaries so plain `setZoom`, `setPan`, `setSelection`, and similar hot-path store writes prove that only the intended subtree rerenders
- [x] [impl] document and enforce sketch store usage rules: broad shell components should subscribe only to stable/slow state, hot mutable state should stay near `SketchCanvas`/overlay consumers, and selector helpers should avoid bundling unrelated state just for convenience
  - **Done:** Created `STORE_RULES.md` with 7 documented rules and enforcement guidance. Removed the deprecated `useSketchStoreSelectors()` aggregator. Added `useActiveToolSettings()` narrow hook. Updated all connected component JSDoc comments documenting subscription boundaries.
- [x] [impl+test] store/document split hardening: reduce broad `store.document` fanout through `SketchEditor.tsx` and nearby shells so layer list, active layer, canvas metadata, transform state, and autosave/export plumbing do not all rerender together by default
  - **Done:** Split `ConnectedLayersPanel`'s broad `document` subscription into narrow field selectors (`document.layers`, `document.activeLayerId`, `document.maskLayerId`, `document.canvas.width`, `document.canvas.height`). Scalar fields (activeLayerId, maskLayerId, canvas dimensions) no longer cause rerenders when unrelated document mutations occur. Added regression tests in `subscriptionBoundaries.test.tsx`.
- [x] [impl+test] store/selection split hardening: keep committed selection state and live selection preview state separate so marquee/lasso/move/add/subtract flows can update overlays and preview refs without forcing full editor-shell subscriptions on every mask mutation
  - **Done:** Added cached `hasActiveSelection` boolean to `SelectionSlice` that's maintained when `setSelection`, `selectAll`, `invertSelection`, and `reselectLastSelection` are called. Shell components (`ConnectedToolTopBar`, `ConnectedContextMenu`) now subscribe to the stable boolean instead of the full selection mask, so mask mutations that don't change the boolean state don't trigger rerenders. Added regression tests proving boolean stability.
- [x] [impl+test] store/tool-settings split hardening: narrow `toolSettings` subscriptions so top bars, modal chrome, cursor/canvas hot paths, and non-active tool panels do not all rerender from one paint-tool slider or mode change
  - **Done:** Added `useActiveToolSettings()` hook that returns only the resolved settings for the currently active tool. Components that only need the active tool's settings can use this instead of `useResolvedToolSettings()`. Added regression tests proving isolation from zoom, pan, and selection changes. Documented usage guidance in `STORE_RULES.md`.
- [x] [impl] replace `hooks/useSketchStoreSelectors.ts` convenience bundling with clearer shell-level selector helpers or focused child subscriptions so new work cannot silently reintroduce broad hot-state dependencies into `SketchEditor.tsx`
- [x] [impl+test] audit `usePointerHandlers.ts`, `SketchCanvas.tsx`, and overlay/runtime bridge props for committed-store vs transient-preview boundaries so interaction state, buffer-heavy state, and UI shell state stop crossing the same prop chain by default
  - **Done:** Grouped `UsePointerHandlersParams` into 8 documented state tiers (committed document, viewport, transient refs, canvas refs, rendering infra, overlay callbacks, event callbacks, preview callbacks) with a boundary contract table. Grouped `SketchCanvasProps` by concern (committed state, viewport/tool, callbacks, layout). Added JSDoc boundary contract to `SketchCanvas` documenting the compositing-gets-bare-doc / pointer-gets-docWithTools / overlay-gets-docWithTools separation. Added 4 regression tests proving: toolSettings isolation from document reference, compositing params shape, zoom isolation from toolSettings, and subscription cross-isolation.
- [x] [impl+test] add regression coverage for document-, selection-, and tool-settings-driven rerender boundaries in `SketchEditor.tsx`, `SketchModal.tsx`, and `SketchCanvas.tsx` so future store wiring changes cannot quietly bring back full-editor invalidation
- [x] [impl] review autosave/export sync and other store-to-prop snapshot flows so persisted document snapshots stop depending on broad shell subscriptions when only localized hot state changed
  - **Done:** Documented autosave boundary contract in `SketchEditor.tsx` showing it fires only on committed document changes (not toolSettings slider ticks, zoom/pan, or selection). Documented export sync deferred-flush pattern in `useExportSyncActions.ts` with full contract explaining ref-based pending flags, flush timing, and no-store-subscription design. Added 4 regression tests proving document reference stability across toolSettings, zoom/pan, and selection changes.

### PHASE 1 — completed sections (from active roadmap)

#### 1.1 — Helper-tool architecture blockers (completed)

Do these first. Recent clone/blur bugs showed that helper paint tools still duplicate too much lifecycle and sampling logic outside the shared seams.

- [x] opening editor should be faster, find causes, also: maybe image loading can happen after editor is opened
  - **Investigation:** The editor UI already shows immediately (`canvasReady` is set synchronously in `useLayoutEffect`). Image loading for layers already happens in the background (each `setLayerData` call starts an async `Image()` load concurrently). The main bottleneck for startup speed with `imageReference` layers is main-thread image decoding via `new Image()`.
  - **Fix applied:** Optimized `Canvas2DRuntime.setLayerData` to use `fetch()` + `createImageBitmap()` for HTTP/relative URLs (the common case for `imageReference` layers). `createImageBitmap` decodes images off the main thread, reducing blocking during editor startup when multiple layers load simultaneously. Falls back to the standard `new Image()` path for data URLs and if `createImageBitmap` is unavailable.
- [x] unify helper paint-tool stroke/session behavior so `CloneStampTool.ts` and `BlurTool.ts` stop carrying ad hoc copies of lifecycle, mapper setup, dirty-rect redraw, and alpha-lock behavior that already belong in shared paint/session boundaries
- [x] reduce remaining duplicated alpha-lock and per-stroke orchestration logic between `PaintSession.ts`, `CloneStampTool.ts`, and `BlurTool.ts`
- [x] harden affine dirty-region redraw behavior so transformed layers do not rely on translation-only invalidation assumptions during paint/helper-tool updates
- [x] add focused regression coverage for clone/blur correctness on transformed or bounds-expanded layers
- [x] add focused regression coverage for clone stamp anchoring across pan/zoom, second-stroke re-anchor, and `active_layer` vs `composited` sampling
- [x] verify and lock down selection parity for blur vs clone so both tools follow one documented clipping/selection rule

#### 1.2 — Remaining correctness and UX fixes (completed)

Do these after the helper-tool architecture blockers above.

- [x] Selection tool: ellipse should not be cut off at the canvas border after drawing the selection
- [x] Sketch Node: remove `Layer In` / `Layer Out` from handle names so only the layer name is shown
- [x] Sketch Node: remove the default `Image Input` handle on the sketch node
- [x] rethink layer action buttons: sort them, decide what belongs in the top and bottom groups, remove crop-canvas icons from the main group, but keep crop in the context menu
- [x] fix small delay when starting brush strokes; mouse cursor hangs for about 50 ms right after starting a stroke. verify whether it still exists while working on this area

### PHASE 2 — completed sections

#### 2.1 — Transform, Zoom, Selection (completed)

Do not start advanced transform modes until these tasks are done.
Do not only fix this sections items with workarounds, investigate core implementations if needed.

- [x] keep the updated layer preview correct while scaling, moving, and future advanced transform modes; preview behavior must not diverge from commit/history/export
- [x] make the transform tool gizmo adapt to layer size so small layers do not get a full-canvas gizmo
- [x] fix top/left transform scaling; this remains a valid active bug
- [x] change transform `Commit`, `Cancel`, and `Reset` from text buttons to icon actions once the interaction semantics are stable
- [x] fix transform tool: zooming loses the transform gizmo
- [x] fix transform tool: confirm sometimes cuts off parts of layer. transformations should not delete layer parts.
- [x] fix transform tool: confirm transformation moves layer
- [x] fix transform tool: scaling is faster than mouse delta, causing transform handles to move away from mouse. the mouse position should dictate where handles go.
- [x] fix transform tool: scaling negatively should mirror - currently does not go beyond zero
- [x] fix zoom tool: zooming is still noticeable slow
- [x] fix transform tool: scaling is mostly broken after supposed fix, also does not show realtime update, only after confirm
- [x] fix transform tool: moving is broken after supposed fix
- [x] fix transform tool: scaling is partly broken, some handles do not work like right + left
- [x] fix Selection tool: still after proposed fix: starting a new selection AND ending a selection freezes shortly
- [x] fix CTRL + i shortcut to inverse layer colors: should adhere to selection mask if any exists

#### 2.2 — Transform lifecycle shortcuts (completed)

Add the core transform lifecycle only after `2.1` is stable.

- [x] `Ctrl+T` / `Cmd+T` enters Free Transform
- [x] `Enter` / `Return` commits the transformation
- [x] `Esc` cancels the transformation
- [x] `Ctrl+Z` / `Cmd+Z` undoes the last handle adjustment while still in transform mode
- [x] right-click inside the bounding box opens a context menu with transform actions

#### 2.3 — Advanced transform modes and modifier rules (completed items)

Do not start these until preview parity, gizmo sizing, and lifecycle shortcuts are working cleanly.

- [x] transform tool: add ENTER and ESC shortcuts to confirm / cancel transformation (already implemented in 2.2 above)
- [x] implement the base modifier-key contract for transform interactions
  - **Done:** `modifierIntent.ts` provides centralized modifier-key interpretation (`ModifierSnapshot`, `selectionCombineMode()`, `shapeConstraintFromRefs()`). `TransformTool.ts` captures `shift` and `alt` modifiers during drag via `ctx.shiftHeldRef` and `ctx.altHeldRef`. `computeTransform.ts` consumes these for proportional lock, scale-from-center, and rotation snap.
- [x] support scale behavior for free, proportional, axis-only, and from-center cases
  - **Done:** `computeScaleTransform()` in `computeTransform.ts` implements all four modes: free (independent X/Y without Shift), proportional (Shift held — radial distance ratio), axis-only (edge midpoint handles constrain to single axis), and from-center (Alt held — `edgeFactor = 1` scales both sides symmetrically).

Modifier-key target behavior (completed rows):

- [x] no modifier -> scale (default)
  - **Done:** Default handle interaction applies scale. `computeTransformForHandle()` dispatches to `computeScaleTransform()` for all handle types except `move` and `rotate`.
- [x] `Alt` / `Option` -> from center / symmetrical
  - **Done:** `computeScaleTransform()` uses `edgeFactor = alt ? 1 : 0.5` so Alt scales from center (both sides move) while no-Alt anchors the opposite edge.

#### 2.4 — Selection context menu (completed entries)

- [x] add a selection-tool right-click context menu entry for `Select Inverse`
- [x] add a selection-tool right-click context menu entry for `Deselect`
- [x] add a selection-tool right-click context menu entry for `Reselect`
- [x] add a selection-tool right-click context menu entry for `Layer via Copy`
- [x] add a selection-tool right-click context menu entry for `Layer via Cut`
- [x] add a selection-tool right-click context menu entry for `New Layer...`
- [x] add a selection-tool right-click context menu entry for `Free Transform`
- [x] add a selection-tool right-click context menu entry for `Transform Selection`
  - **Done:** Added `Transform Selection` menu entry in `SketchCanvasContextMenu.tsx` with `HighlightAltIcon`. Currently disabled (grayed out) — the `onTransformSelection` prop is optional and wired but no backend implementation exists yet. The entry will enable when transform-selection infrastructure is implemented.
- [x] add a selection-tool right-click context menu entry for `Fill`
- [x] add a selection-tool right-click context menu entry for `Stroke`

### PHASE 6 — shipped drawing UX (completed item)

- [x] drawing extensions: ADJUSTABLE stabilizer controls to help with drawing less jaggy lines, similar to https://github.com/steveruizok/perfect-freehand. one implementation that all drawing tools can use.

---
