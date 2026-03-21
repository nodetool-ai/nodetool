# Sketch Editor — Comprehensive Feature Checklist

> **Status**: Phase 1 complete, Phase 2 nearing completion  
> **Last updated**: 2026-03-21

**How to read this doc:** **Remaining work** first → **Defaults** & **Keyboard shortcuts** → **Architecture** → **Recommended follow-ups** (backlog, Krita, tips) → **Appendices** (shipped Phase 1 & 2) → **Stretch goals** last.

Feature target / product spec: <https://mexes1978.github.io/manual-comfysketchpro/>  
Reference implementation: <https://github.com/Mexes1978/comfyui-comfysketch/blob/main/js/comfysketch.js>

---

## Remaining work

### Phase 2 — in progress

> Goal: strong base for common sketch / mask workflows.

#### Drawing tools — gaps

| Tool                     | NodeTool today                                | Parity / gaps                                                                                                                                                                 |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brush (B)                | Size, opacity, hardness, color                | [ ] **Pressure** from pointer events / tablet; [ ] optional **roundness** + **angle** (oval brush footprint)                                                                  |
| Pencil (P)               | Size 1–10, square caps, pixel-aligned strokes | [ ] True **1px anti-aliased pencil** mode (always 1px feel at any zoom)                                                                                                       |
| Line (L)                 | Free line + arrow                             | [x] **Shift**: horizontal / vertical / 45° constraint while dragging                                                                                                          |
| Ellipse (O) (“circle”)   | Ellipse + fill options                        | [x] **Shift**: **perfect circle** from bounding box                                                                                                                           |
| Rectangle (R) (“square”) | Rectangle + fill options                      | [x] **Shift**: **perfect square**                                                                                                                                             |
| Clone / copy brush       | —                                             | [ ] **Alt+click** (or chord) sets source; stroke copies pixels at offset — clone stamp; sample from composited or active layer only (specify)                                 |
| Healing brush            | —                                             | [ ] Spot-heal / texture blend: sample region + paint destination with luminance/edge-aware mix (scope: “good enough” vs full Photoshop); optional content-aware backend later |

Fill, eraser, eyedropper: shipped — see **Appendix: Shipped — Phase 2 (to date)**.

- [x] **Flip active layer** horizontal / vertical (destructive; distinct from mirror-while-drawing)
- [x] improve Blur brush: fixed hard edges by using circular radial-gradient mask blending
- [ ] Selection tools (rectangle select, lasso, magic wand with Photoshop-style options)
- [x] Crop tool (C key, drag to select crop region)
- [x] Gradient tool / gradient fill (T key, linear + radial, drag to draw)
- [x] Adjustment section with sliders for: brightness, contrast, saturation (collapsible panel with Apply button)
- [x] **Brush engine variants** (see **Brush types** below)
- [ ] **Straight Lines for drawing with Brushes, Eraser** draw straight lines when holding SHIFT key and clicking

#### Brush types (engine / presets)

> Brush type selector (Round / Soft / Airbrush / Spray) in toolbar. Each type has distinct drawing behavior.

| Type     | Target settings            | Status                                                        |
| -------- | -------------------------- | ------------------------------------------------------------- |
| Round    | Hardness, roundness, angle | [x] Default; hardness controls falloff; [ ] roundness + angle |
| Soft     | Hardness, roundness, angle | [x] Softer default falloff (hardness capped at 0.3)           |
| Airbrush | Flow, softness             | [x] Low-opacity radial dab accumulation per point             |
| Spray    | Density                    | [x] Particle scatter (stochastic dots within brush disk)      |

#### Color system

- [x] Color modes as button group with 3 buttons for RGB, HEX, HSL. also bigger.
- [x] fix HEX, RGB, HSL buttons not showing color input — each mode now shows its own input fields (hex text input, R/G/B number fields, H/S/L number fields)
- [x] make the default palette nicer: 7 rows × 7 columns — 1 gray row (black→white) + 6 hue rows (red, orange, green, cyan, blue, purple) with dark-to-light variations
- [x] add alpha support. also for gradients

#### Layers

- [x] **Merge down** / merge selected / flatten visible
- [x] **Drag-and-drop layer reordering**: vertical drag with drop indicator
- [x] **Layer thumbnails**: small preview images in layers panel
- [x] **Alpha lock per layer**: lock transparency — painting only affects existing opaque pixels (🔒 indicator)
- [ ] Group / folder layers
- [ ] new layers should be created as transparent as default.
- [ ] the layer colors [transparent], BLACK, WHITE, GRAY should be in right panel in first row with the + to add a new layer - and just show as colors, no text
- [ ] find a better icon for mask button in right panel

#### Canvas & view

- [x] Zoom 2x faster (factor changed from 1.15 to 1.3)
- [x] canvas size: set with presets and custom — Canvas Size section in toolbar with preset buttons and custom W×H inputs
- [x] **Preset sizes** in UI: 512×512, 512×768, 768×512, 1024×1024, 1920×1080, **Custom…**
- [x] **Space + drag** to pan from any tool (in addition to middle mouse)
- [x] **Toggle UI / panels** shortcut (**Tab**)

#### UI & interaction

- [x] Prevent shortcuts from firing in the node editor while the sketch modal is open
- [x] **Improve** shortcuts reference panel (slightly larger font, collapsible)
- [x] **Panel layout persistence** (collapsed state in `localStorage`)
- [x] **Collapsible toolbar sections** (Colors, Settings, Actions, Swatches, View, Shortcuts)
- [x] **Unified tool grouping** (all tools in one section, shapes below draw tools)
- [x] move from left to right panel: Canvas Size, Shortcuts. align those 2 items on bottom
- [x] improve **Context-sensitive** right-click menu: add quick options for currently active tool
- [ ] **Sketch command palette** (canvas right-click) — redesign as the primary in-canvas hub: compact tool DNA, icon-forward tool switcher, bold intentional chrome (see **Sketch command palette** below)
- [ ] improve **Color Select Buttons** hex, rgb, hsl buttons and stuff inside the picker
- [ ] improve **Color Select Buttons** allow holding mouse pressed and close with button, not on click. currently feels sluggish when dragging.

- [x] adjustments for brightness, contrast, saturation without apply button - apply directly on change with small debounce like 100ms
- [ ] **fix undo history** some actions are missing in undo history. find stuff to improve.

#### Sketch command palette (canvas context menu)

> **Intent:** The right-click surface should become the **primary in-canvas command hub**: fast, bold, and obviously designed. It should feel closer to a compact creative-tool palette than a default app menu. A user should be able to open it and instantly answer: **what tool am I on, what are my current settings, and what is the next thing I can do?**

**Problem today:** the current MUI `Menu` feels like a stack of unrelated rows. It is too vertical, too text-heavy, and too timid visually. Important actions and state are present, but they do not read as a system: weak hierarchy, weak recognition, almost no "current context" signal, and too much scanning for common actions.

**Design goal:** make the menu feel like the **heart of the sketch workflow**, not a secondary overflow. It should be the fastest place to:

- confirm current drawing state
- make parameter changes to current tools without leaving the canvas
- jump to another tool by recognition, not reading
- trigger canvas actions without hunting in the side panels

**Non-goals:**

- Do **not** mirror the entire right panel inside the menu
- Do **not** turn it into a dense settings inspector
- Do **not** use one full-width row per preset if a chip row, segmented control, or slider can express the same choice more cleanly

**Core design principles:**

- **Recognition over reading:** icon-first, strong active states, short labels
- **Stable structure:** same 3-4 sections every time so muscle memory forms
- **High signal density:** compact controls, but never cramped or ambiguous
- **Immediate context:** current tool and key numbers must be readable in one glance
- **Designed chrome:** looks intentional, opinionated, and slightly bold; avoid default-menu vibes

**Target structure: 4 sections max** (same mental model every time; section 2 changes with active tool):

Note: section 1 is conceptually the **current-state header**, but it should likely be **unlabeled in the actual UI**. The user should understand it immediately from the active tool, numeric readout, and color chips, without needing a literal "Now" heading.

| #     | Section      | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Current state** | Anchor the user immediately. Show **active tool**, a compact status line with the 1-3 values that matter most (example: `Brush · 18 px · 72% · Soft`), plus **FG / BG chips** and **swap** when color matters. This section should answer "where am I?" in under a second. In the actual UI, this can remain **unlabeled** if the hierarchy is obvious.                                                                                                                                                                             |
| **2** | **Quick controls** | Show the current tool's most important controls in a **compressed but friendly** format. This is the only section that changes meaningfully per tool. Examples: brush/pencil = size, opacity, hardness/type; fill = tolerance, contiguous/global; shape tools = stroke/fill, border width; blur/smudge = strength; crop = commit/cancel actions. Prefer **chip rows**, **segmented controls**, **thin sliders with visible value**, or **toggle + numeric** combinations. |
| **3** | **Tools**    | Provide a **compact icon grid** in toolbar order so tool switching becomes recognition-based. Active tool gets a strong selected state. Show shortcut badges in a muted but legible style. On hover/focus, label appears clearly; at rest, the grid should stay visually light and fast to scan.                                                                                                                                                                          |
| **4** | **Canvas**   | House document-level actions that are still part of drawing flow: **Undo / Redo** as a paired control, **Clear layer**, **Export PNG**, and later **Fit**, **100%**, **Toggle UI**. Keep this section tight and utility-focused so it does not compete with the tool sections.                                                                                                                                                                                            |

**Compact control patterns (important):**

- **Do use:** 4-6 preset chips for common values, with one thin slider for precision
- **Do use:** segmented icon buttons for binary/small-set choices (`fill` on/off, brush type, contiguous/global)
- **Do use:** inline numeric readouts beside sliders so values feel precise, not vague
- **Do use:** paired controls where relationships matter (`Undo / Redo`, `FG / BG`, width + opacity)
- **Avoid:** long vertical preset lists, repeated labels, or controls that need two lines unless absolutely necessary

**Visual language (must feel intentional):**

- **Container:** use `Popover` or custom surface, not plain menu chrome. Rounded corners, confident padding, clear border/elevation, slightly elevated over canvas.
- **Layout:** balanced rectangular footprint; avoid a narrow, overly tall menu. Better slightly wider and denser than long and scroll-like.
- **Type:** section labels as overline / small caps; active tool name semibold; numeric values tabular; helper labels quiet but readable.
- **Icons:** same visual language as toolbar, but with stronger selected and hover states. Icons should do real recognition work, not just decorate labels.
- **Color:** selected states, chips, and tool highlights should feel deliberate. Current tool should "pop" without becoming noisy.
- **Spacing:** tighter than standard MUI menus, but with clear internal rhythm. Sections should feel grouped, not crowded.

**Interaction details:**

- `Escape` closes immediately
- Right-click near the cursor; menu should not feel detached from the drawing action
- Strong `focus-visible` rings and `aria-label`s for icon-only controls
- Hover/focus states should be crisp and fast; no sluggish feeling when moving across controls
- Sliders and chips should be tuned for quick edits, not precision-inspector workflows
- Stretch: later allow type-to-search or slash-command mode, but not in v1

**Implementation direction:**

- Prefer **`Popover` + structured layout** (`Box`, `Stack`, `Grid`) rather than many `MenuItem`s
- Extract a dedicated component such as **`SketchCanvasContextMenu.tsx`**
- Keep existing state/setter wiring (`setBrushSettings`, tool selection, undo/redo, export) and focus this task mostly on **information architecture + presentation**
- Build section 1 and 2 first; if those feel excellent, section 3 and 4 can stay simpler
- Optimize for the common case: brush, pencil, eraser, fill, shapes, eyedropper

**Code structure note:**

- Keep the command palette as a **self-contained feature**, not more logic embedded directly into `SketchCanvas` / `SketchEditor`
- Split into a small **container** plus simple presentational section components (for example: `CurrentStateSection`, `QuickControlsSection`, `ToolsSection`, `CanvasSection`)
- Move tool-specific control definitions into **data/config helpers** where possible, so adding a new tool mostly means adding a config entry rather than rewriting menu layout code
- Reuse existing store actions/selectors through a thin hook or adapter layer; avoid duplicating sketch state logic inside the menu component
- Keep visuals, section layout, and tool-control mapping separate enough that the menu can expand later without turning into another large all-in-one file

**Success criteria / done when:**

- [ ] The menu looks like a **designed tool palette**, not a default framework menu
- [ ] A user can identify **active tool + key settings** within **~200 ms** of opening it
- [ ] Brush / pencil / eraser controls are **shorter and clearer** than the current row stack
- [ ] Tool switching feels faster because the **Tools** section is recognition-based, not reading-based
- [ ] The four sections are easy to understand and remember: **current state / quick controls / tools / canvas** (with the first section potentially unlabeled in the actual UI)
- [ ] Common actions can be done with fewer eye movements between canvas, toolbar, and right panel

#### Gesture shortcuts (parity — open conflicts)

| Reference    | Intent            | NodeTool plan                                                                       |
| ------------ | ----------------- | ----------------------------------------------------------------------------------- |
| **S** + drag | Adjust brush size | [x] Canvas drag while **S** held (do **not** break **Ctrl+S** save).                |
| **O** + drag | Adjust opacity    | [ ] **Conflict:** **O** = ellipse. Use **Alt+O** / **Shift+O** / opacity ring only. |
| **X**        | Swap FG/BG        | [x] Shipped (with FG/BG color model).                                               |
| **Space**    | Pan / panels      | [x] **Space+drag** = pan; **Tab** = toggle panel visibility.                        |

#### Node behavior & SketchInput

- [x] **Node / property widgets:** canvas **preset** dropdown + **custom W×H**
- [x] **Node / property widgets:** **initial background** quick presets — black / white / gray (`backgroundColor` already exists)
- [ ] Fix input image not showing up as layer
- [ ] add small buttons for "Expose input" and "Expose Output" to layers. this creates additional dynamic inputs and output handles in the node using the layer name. one fixed output should always output the composite canvas. see other dynamic nodes for reference.
- [ ] Cleaner node UI styling

---

### Phase 3 — advanced

> Goal: higher-complexity features without destabilizing the foundation.

- [ ] Photoshop-style shortcuts **only where implemented** — keep **Keyboard Shortcuts** + **Photoshop appendix** sections in sync as tools ship
- [ ] Selection tools with transform (scale, rotate, skew)
- [ ] Vector / pen tool
- [ ] Text layers with font settings. global font system with 20 well selected google fonts.
- [ ] Fix Brush behaviour: research how a good brush should look, currently feels too simple
- [ ] Fix Blur Brush behaviour: research how a good blur should look and act when drawing, currently smears and destroys the image
- [ ] Advanced brush system — **pressure, tilt, velocity dynamics** (extends Phase 2 brush types)
- [ ] replace ImageEditor.tsx to use the new SketchEditor instead - ImageEditor can then be deleted

### SAM: Segment Anything (layers from segmentation)

> Needs a **segmentation backend** (Python job, preferably local model, or Replicate / FAL / HF). Sketch UI runs prompts and turns results into document layers.

- [ ] Run **SAM** (or API-compatible successor) on **composited canvas** and/or **input image** — **points** (+/−), **box**, optional **auto / everything** (per backend)
- [ ] **Promote segments to layers** — each chosen region → **new raster layer**; default names (`Segment 1`… or class label if available)
- [ ] **Output mode (user choice):** **cut-out layers** (full-canvas RGBA per segment, transparency outside region) vs **mask-only layers** (alpha / mask emphasis) — same geometry, different pixel representation
- [ ] **Overlay UX** — hover/select candidates, merge segments before commit, discard small regions (min area)
- [ ] **Commit strategies** — **add layers** vs **replace non-base layers**; never remove locked **input_image** base without confirmation
- [ ] **Integration** — progress/errors in modal; cache last result; document **latency, cost, auth** (same patterns as other AI nodes)

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

### Planned (not implemented yet)

See **Gesture shortcuts** under Phase 2 for **O+drag**. **X**, **Tab**, **Space+drag**, **Shift** shape constraints, and **S+drag** are implemented — see table above.

| Key / gesture | Planned action                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| O + drag      | Adjust opacity — conflicts with **O** = ellipse; needs alternate chord                                    |
| J             | Healing brush — when implemented                                                                          |
| (TBD)         | Clone / copy brush — avoid bare **S** (conflicts with **Ctrl+S** + **S+drag**); e.g. **K** or **Shift+S** |

---

## Keyboard Shortcuts from photoshop

> Mac users: swap `Ctrl` → `Cmd` and `Alt` → `Option`

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

### Erasing & Filling

| Shortcut                   | Action                       |
| -------------------------- | ---------------------------- |
| `E`                        | Eraser                       |
| `G`                        | Gradient / Paint Bucket      |
| `Alt + Backspace`          | Fill with foreground color   |
| `Ctrl + Backspace`         | Fill with background color   |
| `Shift + F5`               | Fill dialog (Content Aware…) |
| `Ctrl + Shift + Backspace` | Fill & preserve transparency |

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
└── __tests__/                # 9 test suites, 215+ tests
```

### Integration Points

```
web/src/components/properties/SketchProperty.tsx   → Property widget
web/src/components/node/SketchNode/SketchNode.tsx  → Custom ReactFlow node
web/src/components/node/PropertyInput.tsx           → "sketch" type dispatcher
web/src/components/node/ReactFlowWrapper.tsx        → Node type registration
```

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

### Technology

- **Rendering**: Native HTML5 Canvas 2D API (no external drawing libraries)
- **State**: Zustand 4.5 with immutable updates
- **Styling**: Emotion CSS-in-JS + MUI v7 components
- **Integration**: ReactFlow custom node + property widget

---

## Recommended Follow-ups

- Extract tool logic from `SketchCanvas` into modular tool classes (`tools/` directory)
- Retouch tools: **clone/copy brush**, **healing brush** (Phase 2); shortcuts without clashing **S**
- SAM / segmentation: backend job + **masks → layers** (Phase 3)
- Selection tools for copy/paste/transform workflows
- Layer thumbnail previews in the layers panel
- Import PNG into layer / new layer
- Phase 2 backlog still includes: DnD layer reorder, user color presets, full HSV wheel + HSL/RGB sliders

### Backlog candidates

- [x] **Alt + click** temporary eyedropper while Brush/Pencil/Eraser/Fill is active — picks color without switching tool
- [x] **Keyboard shortcut for vertical mirror** — **Shift+M** = vertical; **M** = horizontal
- [ ] **Touch / tablet**: pinch-zoom, two-finger pan; optional palm rejection
- [ ] **Pixel workflow**: pixel grid overlay, snap-to-pixel, crisp view at high zoom
- [ ] **Rulers + draggable guides**
- [ ] **Performance guardrails**: max megapixels warning; history memory cap by pixel count; throttle compositing on huge documents
- [ ] **Accessibility**: focus trap; **Esc** closes modal; visible focus in layer list; ARIA on tools
- [ ] **QA**: Playwright (or RTL) smoke — open sketch from node, stroke, assert serialization / no graph shortcut bleed
- [ ] **Export options**: PNG with alpha vs opaque flatten; optional JPEG for previews
- [ ] **Shader System**: draw and fill with webgpu shaders
- [ ] **AI Healing Brush**: add healing brush functionality that uses AI model. research and present plan before implementing.
- [ ] **Tonemapping**: add professional tonemapping section with 10 good presets

### Krita-inspired candidates

- [x] **Stroke stabilizer / lazy smoothing** — moving-average smoothing (window=4) for brush strokes
- [ ] **Rotate canvas (view only)**
- [ ] **Wrap-around / tiling mode**
- [x] **Alpha lock** — painting only affects existing opaque pixels; lock transparency indicator in layers panel
- [ ] **Isolate / solo layer**
- [ ] **Pop-up palette** (radial HUD)
- [ ] **Smudge / color-smudge brush**
- [ ] **Extended symmetry** (N-fold / multi-point)
- [ ] **Gamut hints** in picker (lower priority)

## Target UX tips

- Double-click a tool (when implemented) for its settings.
- Lower hardness + airbrush-style flow (when available) for soft shading.
- Layers early; merge only when composition is stable.
- **S+drag** for brush size once implemented.
- **Tab** (or agreed shortcut) to maximize canvas for review.

---

## Appendix: Shipped — Phase 1 (MVP)

> Goal delivered: stable editor foundation with image + mask output.

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

### Color

- [x] Per-tool color + shared swatch strip (28 preset colors)
- [x] **Hex input** (`#RRGGBB`) in picker
- [x] **Foreground / background** colors with **X** swap (optional **D** = reset black/white)

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

### Node / SketchInput

- [x] Preview thumbnail on node
- [x] Real-time output updates during editing
- [x] Output: flattened **image** + **mask** (PNG / data URL pipeline)
- [x] Input image auto-loading with canvas resize
- [x] Canvas **preset** dropdown + **custom W×H** on node / property widgets
- [x] **Background presets** — black / white / gray quick buttons in node / toolbar

---

# FEATURE IDEAS / STRETCH GOALS

- [ ] Multiple canvases/documents
- [ ] Palettes / custom swatch management (save/load)
- [ ] Richer project operations (save/load/templates)
- [ ] PSD/ORA compatibility import/export
- [ ] 3D layer support
- [ ] Clipping masks / clipping groups
- [ ] Layer effects / filters (blur, sharpen, etc.)
- [ ] Custom plugin / tool extensibility
- [ ] Better project persistence (`localStorage` backup / file export)
- [ ] Import PNG into current layer
- [ ] Export project file (JSON + embedded images)
- [ ] SVG import/export
- [ ] Sketch-local light/dark toggle inside modal; draggable/collapsible panels (if not tracked only in Phase 2)
- [ ] SAM — stretch reminder only; full checklist under Phase 3 **SAM: Segment Anything**
