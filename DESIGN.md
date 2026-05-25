---
name: NodeTool
description: Visual platform for composing and running AI workflows. Dark studio for creative pros.
colors:
  primary: "#6690d4"
  secondary: "#E879F9"
  attention: "#E35BFF"
  error: "#FF5555"
  warning: "#FFB86C"
  success: "#50FA7B"
  info: "#22D3EE"
  node: "#029486"
  input: "#2e4a4e"
  output: "#3e3448"
  link: "#93C5FD"
  link-visited: "#A5B4FC"
  progress: "#556611"
  delete: "#FF2222"
  job: "#2838a8"
  folder: "#d6ae67"
  provider-api: "#93C5FD"
  provider-local: "#86EFAC"
  provider-hf: "#C4B5FD"
  canvas-bg: "#08090A"
  canvas-grid: "#1F2126"
  app-header: "#0A0B0D"
  tabs-header: "#101113"
  surface-paper: "#101113"
  surface-node: "#1B1D21"
  surface-node-group: "#22252A"
  surface-node-header: "#141518"
  brightest: "#FCFCFC"
  text-primary: "#F7F8F8"
  text-secondary: "#8A8F98"
  divider-on-dark: "rgba(255,255,255,0.08)"
typography:
  display:
    fontFamily: "'Inter', sans-serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Inter', sans-serif"
    fontSize: "1.375em"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Inter', sans-serif"
    fontSize: "1.125em"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Inter', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  body-secondary:
    fontFamily: "'Inter', sans-serif"
    fontSize: "0.875em"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Inter', sans-serif"
    fontSize: "0.75em"
    fontWeight: 500
    letterSpacing: "0.04em"
  mono:
    fontFamily: "'JetBrains Mono', 'Inter', monospace"
    fontSize: "0.875em"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  xxl: "16px"
  pill: "9999px"
  node: "8px"
  dialog: "20px"
  button-small: "4px"
  button-large: "6px"
spacing:
  unit: "4px"
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.brightest}"
    rounded: "{rounded.button-large}"
    padding: "6px 14px"
  button-primary-hover:
    backgroundColor: "{colors.attention}"
    textColor: "{colors.brightest}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.button-large}"
    padding: "6px 14px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-node}"
  chip:
    backgroundColor: "{colors.surface-node}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.surface-paper}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  input-focus:
    backgroundColor: "{colors.surface-paper}"
    textColor: "{colors.text-primary}"
  card-node:
    backgroundColor: "{colors.surface-node}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.node}"
    padding: "0"
  card-node-header:
    backgroundColor: "{colors.surface-node-header}"
    textColor: "{colors.text-primary}"
    padding: "4px 8px"
  tooltip:
    backgroundColor: "rgba(12,13,16,0.96)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
---

# Design System: NodeTool

## 1. Overview

**Creative North Star: "The Studio at Night"**

NodeTool is a dark studio lit by what you're making. The room recedes; the artifacts glow. The canvas (`#08090A`) is the floor of the studio, dotted with a faint grid (`#1F2126`); panels and toolbars are quiet metal in slightly lifted tones (`#101113`, `#1B1D21`); the only saturated color in a resting workflow is the node-teal of the running graph and the magenta of the user's current selection or attention point. When generated media lands, the UI gets out of the way and lets it carry the visual weight.

The system is **dense without being cramped**. Inter at 15px body with a tight 1.125 scale ratio means a node inspector can show twenty fields without feeling like a wall. The eight-step radius scale (`xs` 2px through `xxl` 16px) reserves the larger radii for dialogs and assets, keeping working surfaces (nodes, inputs, buttons) at 4-8px so the canvas reads as precision instrumentation, not a card grid. Spacing is on a 4px unit; same padding everywhere is avoided on purpose.

This system explicitly rejects the **generic SaaS dashboard**: no cream-on-cream cards, no hero-metric tiles, no gradient CTAs, no identical card grids of "features", no Inter-on-slate Vercel-template look. It also rejects the adjacent traps: enterprise no-code pastel (n8n, Zapier), ComfyUI developer-raw (power without craft), and Notion-minimalism (too quiet for a creative tool).

**Key Characteristics:**
- Dark by default; the canvas is the floor, panels are lifted tonal layers.
- Two saturated accents only (`primary` blue, `attention/secondary` magenta); the canvas-teal (`#029486`) belongs to nodes, not chrome.
- Inter for everything UI; JetBrains Mono for code, IDs, and numeric data.
- Tight rounded scale; 4-8px on working surfaces, 12-20px reserved for dialogs and asset cards.
- Tonal layering for depth; shadows reserved for floating chrome (tooltips, menus, dialogs).

## 2. Colors

A dark palette of tinted near-blacks (`#0A0B0D` to `#22252A`) holding two saturated accents and a small semantic set. The canvas is the darkest surface; chrome lifts off it in 3-4 small tonal steps.

### Primary
- **Studio Blue** (`#6690d4`): primary actions, current selection on form controls, focused field rings, primary link emphasis in chrome. Muted on purpose; a louder blue would compete with the canvas.

### Secondary
- **Stage Magenta** (`#E879F9`): secondary highlight; used sparingly on emphasis and attention-grabbing chrome. Pairs with `attention` (`#E35BFF`) which is reserved for canvas-level "look here" cues (validation errors on nodes, attention badges on outputs).

### Tertiary
- **Node Teal** (`#029486`): the default color of a node in the graph. It is the resting color of *content*, not chrome. Never use teal on a button or panel header.
- **Input Slate** (`#2e4a4e`) and **Output Plum** (`#3e3448`): paired tints for the two halves of a node header, signaling data direction at a glance.
- **Provider Pills**: **Api** (`#93C5FD`), **Local** (`#86EFAC`), **HuggingFace** (`#C4B5FD`). Used as small badges on model rows so users distinguish remote, on-device, and HF-hosted providers by hue.

### Neutral
- **Pitch** (`#020202`): the deepest tone; used inside the canvas grid where contrast against running content matters.
- **Canvas Floor** (`#08090A`): the ReactFlow canvas background.
- **App Header** (`#0A0B0D`): the top app bar; one tone darker than `paper` so chrome reads as ambient.
- **Paper** (`#101113`): default panel and dialog surface; the most-used neutral.
- **Tabs Header** (`#101113`): tab strip background, matches paper to stay quiet.
- **Node Surface** (`#1B1D21`): the body of a node card on the canvas.
- **Group Surface** (`#22252A`): the body of a group/loop container; one step lifted from a regular node.
- **Text Primary** (`#F7F8F8`): body text on dark surfaces. Tinted off pure white toward warm.
- **Text Secondary** (`#8A8F98`): metadata, captions, secondary labels.
- **Brightest** (`#FCFCFC`): reserved for `text on accent` (e.g. label on a primary button).
- **Divider** (`rgba(255,255,255,0.08)`): hairline rules between panels and rows.

### Semantic
- **Error** (`#FF5555`) · **Warning** (`#FFB86C`) · **Success** (`#50FA7B`) · **Info** (`#22D3EE`). Dracula-adjacent hues chosen to read on the dark canvas without veering into neon. Pair every state with an icon; color is never the sole signal.

### Named Rules
**The Two-Accent Rule.** Chrome uses **Studio Blue** and **Stage Magenta** only. Node Teal, Input Slate, Output Plum, and the semantic colors belong to the canvas and the running workflow. A toolbar tinted teal is wrong; a node tinted blue is wrong.

**The Canvas-Wins Rule.** When a generated artifact (image, video, audio preview) renders, the surrounding chrome desaturates: panels stay neutral, accents pause. The artifact is the only saturated thing on screen.

**The Tinted-Near-Black Rule.** Never `#000`. Surface neutrals are tinted toward warm-cool gray (the `#020202` to `#22252A` ladder). Pure black flattens the tonal hierarchy.

## 3. Typography

**Display / UI Font:** Inter (with Arial, sans-serif fallback).
**Mono Font:** JetBrains Mono (with Inter, monospace fallback).

**Character:** Inter does everything UI; the only display moments are the largest headings and panel titles. JetBrains Mono is reserved for code blocks, node IDs, numeric data in tables, and CLI/terminal-like surfaces. No serif anywhere. No display font.

### Hierarchy
- **Display** (500, `2rem`, 1.2, letter-spacing `-0.02em`): page-level title in settings, onboarding heroes. Rare.
- **Headline** (500, `1.375em`, 1.25, letter-spacing `-0.015em`): section headers in dialogs and major panels.
- **Title** (500, `1.125em`, 1.3, letter-spacing `-0.01em`): card titles, dialog titles, panel headers.
- **Body** (400, `15px`, 1.45): default text. Inspector field labels, dialog body, descriptions. Cap prose at 65–75ch; data and dense inspectors may run wider.
- **Body Secondary** (400, `0.875em`, 1.45, color `text.secondary`): captions, helper text, metadata rows.
- **Label** (500, `0.75em`, letter-spacing `0.04em`, `text-transform: uppercase`): the `h6` slot. Used as eyebrow labels above grouped controls; tiny chip-like role markers.
- **Mono** (400, `0.875em`, 1.5, JetBrains Mono): code, node IDs, numeric IDs, timestamps in tables, terminal output.

### Named Rules
**The One-Family Rule.** Inter for chrome; JetBrains Mono for content that is itself code or numeric. Never mix a third family.

**The Fixed-rem Rule.** Type sizes are fixed (rem/em), not fluid (`clamp(...)`). A node inspector at 15px reads the same in a 320px-wide panel as it does in a 600px-wide one.

**The Tight-Tracking Rule.** Headings tighten tracking (`-0.01em` to `-0.02em`); body stays neutral; uppercase labels open up to `0.04em`. Tracking moves with weight and case, never randomly.

## 4. Elevation

NodeTool is **near-flat with tonal layering**. Depth is communicated by four tinted near-black surface tiers, not by box-shadows: `app-header` (`#0A0B0D`) < `paper` (`#101113`) < `node` (`#1B1D21`) < `node-group` (`#22252A`). Shadows appear only on **floating chrome**: tooltips, popovers, context menus, and dialogs lift off the page; resting surfaces never do.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)`): tooltips and small popovers. Provides a soft ambient halo plus a hairline highlight that reads as a beveled edge against the dark canvas.
- **Editor Menu** (`box-shadow: 0 10px 30px rgba(0,0,0,0.5)`): node context menus, command menus inside the editor. Stronger drop than `floating` because these overlay the canvas, not a panel.

### Named Rules
**The Flat-By-Default Rule.** Panels, cards, nodes, and inputs cast no shadow at rest. If a surface is gaining shadow on hover, it is wrong; use a tonal change instead.

**The Lift-When-Floating Rule.** Anything that visually leaves the page (tooltip, popover, menu, dialog) gets shadow. The shadow's job is "I am not part of the page beneath me", not "I am important".

## 5. Components

For every variant the project uses `ui_primitives/` (90+ primitives). Raw MUI in feature code is a smell; primitives are mandatory outside `ui_primitives/` and `editor_ui/` (see `web/src/components/ui_primitives/STRATEGY.md`).

### Buttons
- **Shape:** lightly rounded (4–6px). Small buttons use `rounded.button-small` (`4px`); standard use `rounded.button-large` (`6px`). Pills (`9999px`) are reserved for chips and tags, not buttons.
- **Primary:** Studio Blue (`#6690d4`) background, Brightest (`#FCFCFC`) label, weight 500, no text-transform, no letter-spacing flourish. Padding `6px 14px` (compact, dense-tool sizing).
- **Hover / Focus:** background shifts toward `attention` magenta or to the `surface-node` hover state; transitions 150–200ms (`MOTION.normal`). Focus rings are visible always; never `outline: none` without a replacement.
- **Ghost / Tertiary:** transparent background at rest, hover lifts to `surface-node` (`#1B1D21`); used for the bulk of chrome actions where a primary would be too loud.
- **No shadows on buttons. No gradients. No uppercase.** (`MuiButton.root` already strips boxShadow and textTransform.)

### Chips
- **Style:** pill-shaped (`rounded.pill`), `surface-node` background, `text-secondary` label. Used for tags, model labels, status badges.
- **State:** selected = primary-tinted background; unselected = neutral. Hover lifts background one tone.
- **Provider badges** (api/local/hf) tint the chip background with the corresponding provider color at low opacity; the text stays neutral.

### Cards / Containers
- **Node card:** `surface-node` (`#1B1D21`) body, `surface-node-header` (`#141518`) header strip, `rounded.node` (`8px`). Header heights are 28px (`editor.heightNode`) with `8px / 4px` padding. Group/loop nodes use `surface-node-group` (`#22252A`) one step lighter.
- **Panel:** `paper` (`#101113`) background, no border at the panel boundary; separated from neighbors by a hairline divider (`rgba(255,255,255,0.08)`) only.
- **Dialog:** `paper` background, `rounded.dialog` (`20px`), `glass` backdrop (`rgba(0,0,0,0.6)` content overlay). The largest radius in the system; signals "this is a moment".
- **Internal padding:** `8px` for dense rows, `16px` for content blocks, `24px` for dialog bodies. Cards are not the lazy default; most surfaces are panels and rows.

### Inputs / Fields
- **Style:** `paper` background, `rounded.sm` (`4px`), hairline border via `divider`. Padding `6px 8px`. Inspector controls (`editor.heightInspector` 32px) are slightly larger than node controls (28px) for fingertip targets in side panels.
- **Focus:** border shifts to `primary`; no outer glow. Label color shifts to `primary.main`.
- **Error:** border shifts to `error` (`#FF5555`); helper text in error color; an error icon precedes the message.
- **Disabled:** opacity drops; cursor `not-allowed`; no other color change (dark already reads "off").

### Navigation
- **Tabs strip:** `tabs-header` background, matches `paper`; current tab marked by a 2px primary underline, no background pill. Tab labels in body-secondary weight.
- **App header:** `app-header` (`#0A0B0D`) background, one tone darker than `paper`; height kept minimal; left = workspace switcher, right = chat / settings entries.
- **Side panels:** collapsible; header row uses the `## 2. Title` slot; default state is open on desktop, collapsed on narrow widths.

### Tooltips
- **Background:** `rgba(12,13,16,0.96)` with `backdrop-filter: blur(8px)` — the one place blur is allowed.
- **Border:** hairline `divider`. Radius `rounded.md` (`6px`). Padding `6px 10px`.
- **Shadow:** the `Floating` shadow above. Arrow color matches background.

### Canvas (Signature Component)
The ReactFlow canvas is the heart of the product. It uses:
- Background `canvas-bg` (`#08090A`) with a faint dot grid in `canvas-grid` (`#1F2126`) and axis marks in `c_editor_axis_color` (`#17181B`).
- Selection rectangle: translucent white (`#cdcdcd33`).
- Edges (wires) inherit hue from the source node's output type; this is the only place where data-type color carries meaning.
- Node header uses two paired tints (`input` slate `#2e4a4e` on the left, `output` plum `#3e3448` on the right) so the user sees data direction at a glance.

## 6. Do's and Don'ts

### Do
- **Do** use the four-tier tonal ladder (`#0A0B0D` → `#101113` → `#1B1D21` → `#22252A`) for depth. Lifting via tone, not shadow.
- **Do** reserve `primary` blue and `attention` magenta for chrome actions and emphasis only. Two-Accent Rule.
- **Do** keep node working surfaces at `rounded.node` (`8px`); buttons at 4–6px; dialogs at 20px. The radius scale is meaningful.
- **Do** use `ui_primitives/` components for every chrome element. Raw MUI imports outside `ui_primitives/` and `editor_ui/` are out of spec (see `STRATEGY.md`).
- **Do** pair every semantic color (error/warning/success/info) with an icon or shape; color is never the only signal.
- **Do** use JetBrains Mono for code, IDs, timestamps, and numeric table cells; everything else is Inter.
- **Do** respect `prefers-reduced-motion`. Standard transitions are 120–200ms (`MOTION.fast` / `MOTION.normal`); panel/drawer is 350ms (`MOTION.slow`).
- **Do** allow density. Inspectors, node libraries, and asset grids can carry a lot; earn it with the rhythm of varied spacing and the type scale.

### Don't
- **Don't** ship a **generic SaaS dashboard**: no hero-metric tiles, no cream-card grids, no gradient CTAs, no identical card-grids of "features". If a screen could be reskinned as a CRM, redesign it.
- **Don't** drift into **n8n / Zapier / enterprise no-code** styling (pastel node chips, marketing-y empty states, tutorial overlays).
- **Don't** drift into **ComfyUI developer-raw** (unstyled controls, debug-color overlays, no hierarchy). NodeTool is for creative pros, not for engineers debugging the canvas.
- **Don't** drift into **Notion / Apple minimalism** (sterile whitespace, thin grays, no personality). Too quiet for a creative tool.
- **Don't** use `#000` or `#fff` anywhere. All neutrals are tinted (see the ladder above).
- **Don't** use a **side-stripe border** (`border-left > 1px` as a colored accent) on cards, list items, callouts, or alerts. Use full borders, background tints, or a leading icon instead.
- **Don't** use **gradient text** (`background-clip: text`). Solid colors; emphasis via weight or size.
- **Don't** use **glassmorphism** decoratively. The one allowed blur is the tooltip surface; everywhere else, solid.
- **Don't** use **box-shadow on resting surfaces**. Panels, cards, nodes, and inputs are flat; shadow appears only on floating chrome.
- **Don't** use a **display or serif font** in UI labels, buttons, or data. Inter is the system font; JetBrains Mono is the data font.
- **Don't** use **fluid type** (`clamp(...)`) in product chrome; fixed rem only.
- **Don't** use **em dashes** in UI copy. Commas, colons, semicolons, periods, or parentheses.
- **Don't** reach for a **modal** as the first thought. Exhaust inline and progressive disclosure first.
- **Don't** wrap everything in a **card**. Nested cards are always wrong.
