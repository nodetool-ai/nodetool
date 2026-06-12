---
layout: page
title: "Design System"
permalink: /design
description: "NodeTool design system reference — typography, spacing, color, border radius, motion, z-index, and editor tokens."
---

# NodeTool Design System

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) | [UI Primitives Strategy](../web/src/components/ui_primitives/STRATEGY.md)

Single reference for every design token and visual rule in NodeTool. All frontend work must follow these rules. When touching any UI file, scan for violations in the sections below and fix them in the same PR.

**Authoritative source files:**
- Tokens: [`web/src/components/ui_primitives/tokens.ts`](../web/src/components/ui_primitives/tokens.ts)
- Spacing: [`web/src/components/ui_primitives/spacing.ts`](../web/src/components/ui_primitives/spacing.ts)
- Theme: [`web/src/components/themes/ThemeNodetool.tsx`](../web/src/components/themes/ThemeNodetool.tsx)
- Palettes: [`paletteDark.ts`](../web/src/components/themes/paletteDark.ts) / [`paletteLight.ts`](../web/src/components/themes/paletteLight.ts)

---

## 1. Typography

### Fonts

| Variable | Value | Use |
|---|---|---|
| `var(--fontFamily1)` | `'Inter', Arial, sans-serif` | All UI text |
| `var(--fontFamily2)` | `'JetBrains Mono', 'Inter', Arial, sans-serif` | Code, values, node output |

### Size Scale

Four pixel sizes, exposed as CSS custom properties on `:root`. Change them in `ThemeNodetool.tsx` and they propagate everywhere.

| CSS variable | Pixels | Token key |
|---|---|---|
| `var(--fontSizeBig)` | 18px | `FONT_SIZE_SANS.title` |
| `var(--fontSizeNormal)` | 15px | `FONT_SIZE_SANS.body` |
| `var(--fontSizeSmall)` | 13px | `FONT_SIZE_SANS.label` / `FONT_SIZE_MONO.*` |
| `var(--fontSizeSmaller)` | 11px | `FONT_SIZE_SANS.caption` / `FONT_SIZE_MONO.caption` |

Legacy names (`--fontSizeGiant`, `--fontSizeBigger`, `--fontSizeTiny`, `--fontSizeTinyer`) all collapse onto one of the four sizes above.

### The Eight Sanctioned Type Styles

These are the only allowed size+weight+family combinations. Spread them from `TYPOGRAPHY` or use the corresponding primitive.

```tsx
import { TYPOGRAPHY, Text, Label, Caption } from "../ui_primitives";
```

**Sans (Inter)**

| Key | Size | Weight | Line height | Primitive | Use |
|---|---|---|---|---|---|
| `TYPOGRAPHY.sans.title` | 18px / 600 | semibold | 1.3 | `<Text size="big">` | Headings h1–h3, dialog titles, section titles |
| `TYPOGRAPHY.sans.body` | 15px / 400 | normal | 1.45 | `<Text>` | Default body text, paragraphs |
| `TYPOGRAPHY.sans.label` | 13px / 500 | medium | 1.35 | `<Label>` | Form labels, buttons, controls, h4–h6 |
| `TYPOGRAPHY.sans.caption` | 11px / 400 | normal | 1.4 | `<Caption>` | Hints, metadata, badges |

**Mono (JetBrains Mono)**

| Key | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `TYPOGRAPHY.mono.code` | 13px / 400 | normal | 1.5 | Code, values, editor text |
| `TYPOGRAPHY.mono.strong` | 13px / 600 | semibold | 1.5 | Emphasized inline code |
| `TYPOGRAPHY.mono.label` | 13px / 500 | medium | 1.35 | Mono keys and labels |
| `TYPOGRAPHY.mono.caption` | 11px / 400 | normal | 1.4 | Small mono, mono tooltips |

### Allowed Weights

| Token | Value |
|---|---|
| `FONT_WEIGHT.normal` | `400` |
| `FONT_WEIGHT.medium` | `500` |
| `FONT_WEIGHT.semibold` | `600` |

### Usage

```tsx
// Prefer primitives — they pick the right combo automatically
<Text>Body copy</Text>               // sans.body — 15px / 400
<Text size="big">Section Title</Text>// sans.title — 18px / 600
<Label>Channel name</Label>          // sans.label — 13px / 500
<Caption>Updated 2h ago</Caption>    // sans.caption — 11px / 400

// In sx / css blocks, spread the style object
<Box sx={{ ...TYPOGRAPHY.sans.label }}>Filters</Box>
<Box sx={{ ...TYPOGRAPHY.mono.code }}>{value}</Box>
```

### Heading Collapse Rule

HTML headings map to two type styles only:
- `h1–h3` → `TYPOGRAPHY.sans.title` (18px / 600)
- `h4–h6` → `TYPOGRAPHY.sans.label` (13px / 500)

Heading **hierarchy** is expressed through margin, letter-spacing, color, and text transform — never by introducing extra font sizes.

### Forbidden

- Any raw `fontSize` px/rem literal: `"14px"`, `"0.85rem"`, `"20px"`, even `"13px"` — reference `var(--fontSize*)` instead
- `fontWeight: 700`, `fontWeight: "bold"`, `fontWeight: 300` — only `400 / 500 / 600`
- Mixing a size with a non-sanctioned weight for that role (e.g. 15px / 600)
- A fifth font size anywhere in the app

**Exception:** Icon glyph sizing via relative `em` units (e.g. `<DeleteIcon sx={{ fontSize: "1.2em" }} />`) is icon scaling, not text typography — `em` is only allowed for icons.

---

## 2. Spacing — 4px Grid

All `padding`, `margin`, and `gap` — on both axes — must use one of the nine canonical steps. There are no other allowed values.

**Base:** `theme.spacing(1) === 4px`

```tsx
import { SPACING, GAP, PADDING, MARGIN, snapSpacing, getSpacingPx } from "../ui_primitives";
```

### SPACING — raw scale

| Token | Theme units | Pixels | Role |
|---|---|---|---|
| `SPACING.none` | 0 | 0px | Flush |
| `SPACING.micro` | 0.5 | 2px | Icon/label gaps in dense controls |
| `SPACING.xs` | 1 | 4px | Tight stacking |
| `SPACING.sm` | 1.5 | 6px | Compact control padding |
| `SPACING.md` | 2 | 8px | Default gap / padding |
| `SPACING.lg` | 3 | 12px | Grouped sections |
| `SPACING.xl` | 4 | 16px | Panel padding |
| `SPACING.xxl` | 6 | 24px | Large section separation |
| `SPACING.xxxl` | 8 | 32px | Page-level rhythm |

### GAP — for flex / grid `gap`

| Token | Pixels |
|---|---|
| `GAP.none` | 0px |
| `GAP.micro` | 2px |
| `GAP.tight` | 4px |
| `GAP.compact` | 6px |
| `GAP.normal` | 8px |
| `GAP.comfortable` | 12px |
| `GAP.spacious` | 16px |

### PADDING — for container padding

| Token | Pixels |
|---|---|
| `PADDING.none` | 0px |
| `PADDING.micro` | 2px |
| `PADDING.compact` | 6px |
| `PADDING.normal` | 8px |
| `PADDING.comfortable` | 12px |
| `PADDING.spacious` | 16px |
| `PADDING.section` | 24px |

### MARGIN — for margin

| Token | Pixels |
|---|---|
| `MARGIN.none` | 0px |
| `MARGIN.micro` | 2px |
| `MARGIN.tight` | 4px |
| `MARGIN.compact` | 6px |
| `MARGIN.normal` | 8px |
| `MARGIN.comfortable` | 12px |
| `MARGIN.spacious` | 16px |
| `MARGIN.section` | 24px |

### Utility Functions

```tsx
// Snap any arbitrary theme-unit value to the nearest canonical step
const snapped = snapSpacing(2.3); // → 2 (8px)

// Get a px string from theme units
const px = getSpacingPx(3); // → "12px"

// Multi-value padding / margin strings
const p = createPadding(theme, 2, 3); // "8px 12px"
```

### Raw CSS Pixel Grid

When writing plain CSS or `sx` pixel values directly (rare), only these pixels are allowed:

`0 · 2 · 4 · 6 · 8 · 12 · 16 · 24 · 32`

### Forbidden

`5px`, `7px`, `10px`, `13px`, `20px` and any theme unit not in `[0, 0.5, 1, 1.5, 2, 3, 4, 6, 8]`.

**Not spacing:** ReactFlow `fitView({ padding })`, viewport ratios, `opacity`, `scale`, `flex` shrink/grow, `zIndex` — these are not layout spacing and are excluded from the rule.

---

## 3. Color

Colors never appear as hardcoded hex or rgb values in component code. Every color reference goes through `theme.vars.palette.*`.

### Semantic Palette (MUI standard)

| Token | Dark | Light | Use |
|---|---|---|---|
| `theme.vars.palette.primary.main` | `#6690d4` | `#2A8077` | Primary actions, links |
| `theme.vars.palette.primary.light` | `#7aa0e2` | `#4FA59C` | Hover on primary |
| `theme.vars.palette.primary.dark` | `#3d68a8` | `#1E5F58` | Active / pressed primary |
| `theme.vars.palette.secondary.main` | `#E879F9` | `#C97C5D` | Secondary actions |
| `theme.vars.palette.error.main` | `#FF5555` | `#D8615B` | Errors, destructive |
| `theme.vars.palette.warning.main` | `#FFB86C` | `#D99A3B` | Warnings |
| `theme.vars.palette.info.main` | `#22D3EE` | `#3F7D8C` | Information |
| `theme.vars.palette.success.main` | `#50FA7B` | `#6BAA75` | Success states |
| `theme.vars.palette.text.primary` | `#F7F8F8` | `#1A1715` | Main text |
| `theme.vars.palette.text.secondary` | `#8A8F98` | `#5A5550` | Secondary / muted text |
| `theme.vars.palette.text.disabled` | `rgba(247,248,248,0.38)` | `#9A938A` | Disabled text |
| `theme.vars.palette.background.default` | `#08090A` | `#FAF6EF` | Page background |
| `theme.vars.palette.background.paper` | `#101113` | `#FFFFFF` | Surface / card background |
| `theme.vars.palette.divider` | `rgba(255,255,255,0.08)` | `#DCD3C5` | Borders, dividers |

### Custom Semantic Colors (`c_*`)

NodeTool-specific colors for editor and UI chrome. Reference via `theme.vars.palette.*`.

| Token | Use | Dark | Light |
|---|---|---|---|
| `c_app_header` | App header background | `#0A0B0D` | `#FFFFFF` |
| `c_tabs_header` | Tab bar background | `#101113` | `#F2EDE4` |
| `c_node_menu` | Node context menu bg | `#17181B` | `#F7F5F0` |
| `c_node_bg` | Workflow node background | `#1B1D21` | `#FFFFFF` |
| `c_node_header_bg` | Node header background | `#141518` | `#FAF8F5` |
| `c_node_bg_group` | Group node background | `#22252A` | `#FAF8F5` |
| `c_editor_bg_color` | Canvas background | `#08090A` | `#FAF6EF` |
| `c_editor_grid_color` | Canvas grid lines | `#1F2126` | `#EDE6DA` |
| `c_editor_axis_color` | Canvas axis lines | `#17181B` | `#E6E2DE` |
| `c_selection` | Node selection ring | `#8EACA777` | `#5E9A8F33` |
| `c_selection_rect` | Marquee selection box | `#cdcdcd33` | `rgba(94,154,143,0.12)` |
| `c_input` | Input handle color | `#2e4a4e` | `#F9F7F5` |
| `c_output` | Output handle color | `#3e3448` | `#F2F5F2` |
| `c_attention` | Attention / highlight | `#E35BFF` | `#C96E51` |
| `c_delete` | Destructive action | `#FF2222` | `#D8615B` |
| `c_progress` | Progress indicator | `#556611` | `#6BAA75` |
| `c_link` | Hyperlink | `#93C5FD` | `#3F7D75` |
| `c_link_visited` | Visited link | `#A5B4FC` | `#6A8C88` |
| `c_scroll_bg` | Scrollbar track | `transparent` | `transparent` |
| `c_scroll_thumb` | Scrollbar thumb | `#27292E` | `#D1CCC6` |
| `c_scroll_hover` | Scrollbar thumb hover | `#3A3D44` | `#E0DCD6` |

### Greyscale

Indexed from 0 (brightest) to 1000 (darkest) in dark mode; reversed in light mode.

| Index | Dark | Light |
|---|---|---|
| `grey[0]` | `#fff` (white) | `#000` |
| `grey[100]` | `#D4D6DB` | `#2C2A27` |
| `grey[300]` | `#9CA0A8` | `#6A6660` |
| `grey[500]` | `#5C606A` | `#A59F97` |
| `grey[700]` | `#27292E` | `#DED8D0` |
| `grey[900]` | `#0A0B0D` | `#F6F2EC` |
| `grey[1000]` | `#000` (black) | `#FAF7F2` |

Semantic grey aliases (`c_gray0` … `c_gray6`) map to the same scale.

### Custom Surface / Glass

| Token | Use | Dark | Light |
|---|---|---|---|
| `Paper.default` | Default paper | `#101113` | `#FFFFFF` |
| `Paper.paper` | Nested paper | `#101113` | `#F4F0E9` |
| `Paper.overlay` | Popover / overlay bg | `#17181B` | `#F0EDE6` |
| `glass.blur` | Backdrop filter | `blur(16px) saturate(180%)` | `blur(50px)` |
| `glass.backgroundDialog` | Dialog glass bg | `rgba(0,0,0,0.2)` | `rgba(255,248,240,0.27)` |

### Provider Badge Colors

| Token | Use | Dark | Light |
|---|---|---|---|
| `c_provider_api` | API provider badge | `#93C5FD` | `#2C415A` |
| `c_provider_local` | Local provider badge | `#86EFAC` | `#2E5B4E` |
| `c_provider_hf` | HuggingFace badge | `#C4B5FD` | `#6D4B6F` |

### Rules

- **Never hardcode hex or rgb colors** in component code.
- Always reference `theme.vars.palette.*` — the vars switch automatically between light/dark schemes.
- New colors must be added to **both** `paletteDark.ts` and `paletteLight.ts` as a `c_*` token.
- Brand identity (primary/secondary) changes go only in the theme palette, not in individual components.

---

## 4. Border Radius

All `borderRadius` values must use `BORDER_RADIUS.*` constants. Never use raw numbers or raw `var(--rounded-*)` strings in component code.

```tsx
import { BORDER_RADIUS } from "../ui_primitives";
```

### Token Table

| Token | CSS variable | Pixels | Use |
|---|---|---|---|
| `BORDER_RADIUS.xs` | `var(--rounded-xs)` | 2px | Tight insets, dense list items |
| `BORDER_RADIUS.sm` | `var(--rounded-sm)` | 4px | Input fields, small cards |
| `BORDER_RADIUS.md` | `var(--rounded-md)` | 6px | Buttons, controls (`controlRadius`) |
| `BORDER_RADIUS.lg` | `var(--rounded-lg)` | 8px | Panels, menus (`menuRadius`) |
| `BORDER_RADIUS.xl` | `var(--rounded-xl)` | 12px | Cards, modals |
| `BORDER_RADIUS.xxl` | `var(--rounded-xxl)` | 16px | Large surfaces |
| `BORDER_RADIUS.circle` | `var(--rounded-circle)` | 50% | Avatars, circular icons |
| `BORDER_RADIUS.pill` | `var(--rounded-pill)` | 9999px | Tags, chips, compact buttons |

### Semantic Aliases

These have no `BORDER_RADIUS` constant. In TSX, access via `theme.rounded.*`; in plain CSS files, use the `--rounded-*` var.

| Theme key | CSS variable | Pixels | Use |
|---|---|---|---|
| `theme.rounded.dialog` | `--rounded-dialog` | 20px | Dialog / modal outer radius |
| `theme.rounded.node` | `--rounded-node` | 8px | Workflow node cards |
| `theme.rounded.buttonSmall` | `--rounded-buttonSmall` | 4px | Small button radius |
| `theme.rounded.buttonLarge` | `--rounded-buttonLarge` | 6px | Default button radius |

### Usage

```tsx
borderRadius: BORDER_RADIUS.sm     // input fields
borderRadius: BORDER_RADIUS.lg     // panels, menus
borderRadius: BORDER_RADIUS.pill   // tags, chips
borderRadius: BORDER_RADIUS.circle // avatar, FAB icon

// Compose for asymmetric corners
borderRadius: `${BORDER_RADIUS.sm} ${BORDER_RADIUS.sm} 0 0`
```

### Forbidden

Magic numbers: `1`, `3`, `4`, `7`, `10`, `18`, `20`. Raw `"var(--rounded-*)"` string literals in TSX where a `BORDER_RADIUS` constant or `theme.rounded.*` key exists (plain `.css` files use the vars — that's what they're for). For circles, use `BORDER_RADIUS.circle` not `"50%"`.

---

## 5. Motion

All `transition` values must use `MOTION.*` constants. Never write raw timing strings.

```tsx
import { MOTION } from "../ui_primitives";
```

### Duration Tiers

| Token | Value | Use |
|---|---|---|
| `MOTION.fast` | `120ms ease` | Hover micro-interactions, icon state changes |
| `MOTION.normal` | `200ms ease` | Standard UI transitions (color, border, opacity) |
| `MOTION.slow` | `350ms ease` | Panel open/close, drawer animations |

### Property Shorthands

| Token | Value | Use |
|---|---|---|
| `MOTION.all` | `all 200ms ease` | Multi-property transition shorthand |
| `MOTION.border` | `border-color 200ms ease` | Border color changes |
| `MOTION.background` | `background-color 150ms ease` | Background color changes |
| `MOTION.transform` | `transform 120ms ease` | Scale, translate, rotate |
| `MOTION.opacity` | `opacity 150ms ease` | Fade in/out |
| `MOTION.shadow` | `box-shadow 200ms ease` | Elevation changes |

### Usage

```tsx
// Single property
sx={{ transition: MOTION.all }}
sx={{ transition: MOTION.border }}

// Multiple properties (template literal composition)
sx={{ transition: `${MOTION.border}, ${MOTION.shadow}` }}
sx={{ transition: `${MOTION.background}, ${MOTION.opacity}` }}
```

### Forbidden

Raw timing strings of any kind: `"200ms"`, `"0.2s ease-in-out"`, `"all 150ms linear"`, `"background-color 300ms"`. Compose from `MOTION.*` tokens.

---

## 6. Z-Index

Two separate scales serve two different concerns:
- **`Z_INDEX`** — in-content stacking layers (dropdowns, overlays, modals, tooltips, toasts within the NodeTool UI)
- **`theme.zIndex`** — MUI framework layers + Nodetool-specific command layers

### Z_INDEX — content layer

Use for components you build. Import from `ui_primitives`.

```tsx
import { Z_INDEX } from "../ui_primitives";
```

| Token | Value | Use |
|---|---|---|
| `Z_INDEX.base` | 0 | Normal document flow |
| `Z_INDEX.raised` | 1 | Slightly elevated (node selection rings) |
| `Z_INDEX.dropdown` | 10 | Menus, select popovers |
| `Z_INDEX.sticky` | 20 | Sticky headers, fixed toolbars |
| `Z_INDEX.overlay` | 100 | Backdrops, blocking overlays |
| `Z_INDEX.modal` | 200 | Dialogs, drawers |
| `Z_INDEX.tooltip` | 300 | Tooltips |
| `Z_INDEX.toast` | 400 | Toasts and notifications |

### theme.zIndex — MUI + Nodetool layers

Use via `theme.zIndex.*` when you need to co-ordinate with MUI framework components.

| Key | Value | Use |
|---|---|---|
| `theme.zIndex.appBar` | 1100 | App bar |
| `theme.zIndex.drawer` | 1200 | MUI Drawer |
| `theme.zIndex.modal` | 1300 | MUI Modal |
| `theme.zIndex.tooltip` | 1500 | MUI Tooltip |
| `theme.zIndex.behind` | -1 | Below everything |
| `theme.zIndex.commandMenu` | 9999 | Command palette |
| `theme.zIndex.popover` | 10001 | Primary popovers |
| `theme.zIndex.autocomplete` | 10002 | Autocomplete menus |
| `theme.zIndex.floating` | 10003 | Floating panels |
| `theme.zIndex.popover2` | 99990 | Secondary popovers (above popover) |
| `theme.zIndex.highest` | 100000 | Emergency top layer |

### Forbidden

Arbitrary integers (`9999` in new component code, `1000`, `2`, `5`) outside of `Z_INDEX.*` or `theme.zIndex.*`.

---

## 7. Editor Tokens

Editor-specific sizing tokens live in `theme.editor.*`. These apply only behind the editor marker class — do not use them in non-editor components.

```tsx
const { editor } = useTheme();
```

| Token | Value | Use |
|---|---|---|
| `editor.heightNode` | `28px` | Node control height (compact density) |
| `editor.heightInspector` | `32px` | Inspector control height (comfortable density) |
| `editor.padXNode` | `8px` | Node horizontal control padding |
| `editor.padYNode` | `4px` | Node vertical control padding |
| `editor.padXInspector` | `10px` | Inspector horizontal control padding |
| `editor.padYInspector` | `6px` | Inspector vertical control padding |
| `editor.controlRadius` | `6px` | Border radius for controls inside the editor (`BORDER_RADIUS.md`) |
| `editor.menuRadius` | `8px` | Border radius for menus inside the editor (`BORDER_RADIUS.lg`) |
| `editor.menuShadow` | `0 10px 30px rgba(0,0,0,0.5)` | Node context menu drop-shadow |

The `EditorUiProvider` with `scope="node"` applies `heightNode` density; `scope="inspector"` applies `heightInspector` density. Components that are density-aware read these via the provider context.

---

## 8. Virtual Scroll

Pre-computed overscan counts for TanStack Virtual. Access via `theme.virtualScroll.overscan.*`.

| Token | Value | Use |
|---|---|---|
| `overscan.small` | 10 | Short lists (≤50 items) |
| `overscan.normal` | 25 | Default — most lists |
| `overscan.large` | 50 | Large grids, asset galleries |
| `overscan.gridRow` | 4 | Extra grid rows to render |

---

## 9. Scrollbars

Two helpers in `tokens.ts`. Use them instead of writing raw `::-webkit-scrollbar` CSS.

```tsx
import { scrollbarStyles, thinScrollbarStyles } from "../ui_primitives/tokens";

// Standard app scrollbar (10px wide, theme palette colors)
css({
  overflowY: "auto",
  ...scrollbarStyles(theme),
})

// Thin variant (6px, lighter appearance)
css({
  overflowY: "auto",
  ...thinScrollbarStyles(theme),
})
```

Both functions pull colors from `theme.vars.palette.c_scroll_*` so they automatically switch between light and dark themes. Only override scrollbar styles when a component intentionally needs a different appearance (e.g. the chat thread's tinted scrollbar).

---

## 10. Migration Checklist

When editing any UI file, scan for these violations and fix them in the same PR.

| Found | Replace with |
|---|---|
| `borderRadius: 4` / `"4px"` / `"3px"` | `BORDER_RADIUS.sm` |
| `borderRadius: 6` / `"6px"` | `BORDER_RADIUS.md` |
| `borderRadius: 8` / `"8px"` / `"10px"` | `BORDER_RADIUS.lg` |
| `borderRadius: 12` / `"12px"` | `BORDER_RADIUS.xl` |
| `borderRadius: 18` / `"18px"` / `"20px"` | `BORDER_RADIUS.xxl` or `theme.rounded.dialog` |
| `borderRadius: "50%"` | `BORDER_RADIUS.circle` |
| `borderRadius: 999` / `"999px"` | `BORDER_RADIUS.pill` |
| `"var(--rounded-sm)"` raw string | `BORDER_RADIUS.sm` |
| `transition: "all 200ms ease"` | `MOTION.all` |
| `transition: "background-color 150ms"` | `MOTION.background` |
| `transition: "transform 120ms ease"` | `MOTION.transform` |
| `transition: "opacity 150ms ease"` | `MOTION.opacity` |
| Any other raw timing string | Compose from `MOTION.*` |
| `fontSize: "13px"` / `"0.85rem"` | `var(--fontSizeSmall)` or `<Label>` |
| `fontSize: "11px"` | `var(--fontSizeSmaller)` or `<Caption>` |
| `fontSize: "15px"` | `var(--fontSizeNormal)` or `<Text>` |
| `fontSize: "18px"` | `var(--fontSizeBig)` or `<Text size="big">` |
| Any other raw `px`/`rem` font size | Snap to nearest CSS var above |
| `fontWeight: 700` / `"bold"` | `600` (or remove if already paired correctly) |
| `fontWeight: 300` / `200` | `400` (normal) |
| `padding: "5px"` / `gap: 5` | `SPACING.xs` (4px) or `SPACING.sm` (6px) |
| `padding: "10px"` / `gap: 10` | `SPACING.md` (8px) or `SPACING.lg` (12px) |
| `padding: "13px"` / `gap: 13` | `SPACING.lg` (12px) |
| `padding: "20px"` / `gap: 20` | `SPACING.xxl` (24px) |
| `margin: "5px"` etc. | Same snapping rules as padding/gap |
| `zIndex: 9999` in a component | `Z_INDEX.toast` or `theme.zIndex.commandMenu` |
| `zIndex: 1000` | `Z_INDEX.overlay` or `theme.zIndex.mobileStepper` |
| Raw `#hex` / `rgb()` color in sx | `theme.vars.palette.*` token |
| `<Typography>` | `<Text>`, `<Label>`, or `<Caption>` |
| `display: "flex"` in sx | `<FlexRow>` or `<FlexColumn>` |
| `overflow: "auto"` container | `<ScrollArea>` |
| `textOverflow: "ellipsis"` | `<TruncatedText>` |

---

## 11. Adding New Tokens

1. **Spacing**: Only add a new `SPACING.*` step if the existing nine steps genuinely cannot express the design intent. Justify in the PR. Update `spacing.ts`.
2. **Typography**: Do not add a ninth type style. Any new text hierarchy must collapse onto one of the eight existing combinations.
3. **Color**: Add as a `c_*` key in **both** `paletteDark.ts` and `paletteLight.ts`. Document its semantic role in a comment.
4. **Border radius**: Add a new `BORDER_RADIUS.*` entry in `tokens.ts` and a corresponding `--rounded-*` CSS var in `ThemeNodetool.tsx` `MuiCssBaseline`.
5. **Motion**: If a new timing is needed, add to `MOTION` in `tokens.ts` as a named constant — never use the value inline.
6. **Z-index**: Add to `Z_INDEX` in `tokens.ts` or to `theme.zIndex` in `ThemeNodetool.tsx`. Never use a raw integer.

---

## Related Documents

- **[UI Primitives Strategy](../web/src/components/ui_primitives/STRATEGY.md)** — Primitives-first policy, decision tree, migration rules, full 90+ component catalog
- **[UI Primitives README](../web/src/components/ui_primitives/README.md)** — Component API reference
- **[UI Primitives EXAMPLES](../web/src/components/ui_primitives/EXAMPLES.md)** — Practical code examples for every primitive
- **[Development Standards §5](DEVELOPMENT_STANDARDS.md#5-mui-v7--emotion--ui-primitives)** — Enforceable MUI/primitives/token rules
- **[ThemeNodetool.tsx](../web/src/components/themes/ThemeNodetool.tsx)** — MUI theme, CSS variable definitions, component overrides
- **[tokens.ts](../web/src/components/ui_primitives/tokens.ts)** — TYPOGRAPHY, MOTION, Z_INDEX, BORDER_RADIUS, scrollbarStyles
- **[spacing.ts](../web/src/components/ui_primitives/spacing.ts)** — SPACING, GAP, PADDING, MARGIN, snapSpacing
