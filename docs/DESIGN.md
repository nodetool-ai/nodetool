---
layout: page
title: "Design System"
permalink: /design
description: "NodeTool design system reference — typography, spacing, color, border radius, motion, z-index, and editor tokens."
---

# NodeTool Design System

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [UI Primitives Strategy](../web/src/components/ui_primitives/STRATEGY.md)

Single reference for every design token and visual rule in NodeTool. All frontend work must follow these rules. Start at [Element standards](#element-standards): one row per kind of UI element, with the primitive to use and the check that finds deviations. When touching any UI file, scan for violations in the sections below and fix them in the same PR.

**Authoritative source files:**
- Tokens: [`web/src/components/ui_primitives/tokens.ts`](../web/src/components/ui_primitives/tokens.ts)
- Spacing: [`web/src/components/ui_primitives/spacing.ts`](../web/src/components/ui_primitives/spacing.ts)
- Theme: [`web/src/components/themes/ThemeNodetool.tsx`](../web/src/components/themes/ThemeNodetool.tsx)
- Palettes: [`paletteDark.ts`](../web/src/components/themes/paletteDark.ts) / [`paletteLight.ts`](../web/src/components/themes/paletteLight.ts)

**Enforcement:** Most of these rules are linted. The default `npm run lint`
(oxlint) can't express the design-token AST checks, so they run through ESLint
as a dedicated gate: `web/eslint.design.config.mjs` (rules shared from
`web/eslint.design.mjs`) is invoked by `npm run lint:design` and chained into
the root `npm run lint`. `lint:design` also runs `web/scripts/lint-spacing-css.mjs`,
`web/scripts/lint-font-color-css.mjs`, and `web/scripts/lint-radius-css.mjs`, which
extend the spacing, font-size, color, and border-radius rules to plain `.css` files
(ESLint only parses `.ts`/`.tsx`).
**Spacing** (`padding`/`margin`/`gap`), **`fontWeight`**, **font size**
(`design-tokens/font-size-tokens`), **color** (`design-tokens/color-tokens`),
**border radius** (`design-tokens/border-radius-tokens`), raw-MUI imports
(`design-tokens/no-raw-mui`), and **ui_primitives barrel imports**
(`no-restricted-imports` — deep `.../ui_primitives/Foo` paths must go through the
barrel) have reached zero violations and are promoted to **`error`** to lock them
in — a new raw px/rem font size, raw hex/rgb color, magic/`var(--rounded-*)` radius,
or deep primitive import fails the gate. **Motion** (`transition`/`animation`
timing, via `design-tokens/motion-tokens` in TSX and `web/scripts/lint-motion-css.mjs`
in `.css`) and **`zIndex`** (`design-tokens/zindex-tokens` — object-literal
`zIndex` magic integers) are also migrated and locked at **`error`**. All design-token
categories are now at zero violations and enforced.

The font-size and color rules are custom (like spacing) so they catch raw values
inside `styled`/`css` template literals, not just object literals. The color rule
deliberately allows values already routed through a CSS var
(`rgba(var(--palette-primary-mainChannel) / 0.1)` is theme-driven and fine), and
excludes `fill`/`stroke` (SVG/canvas) and `boxShadow`. Genuinely literal
color-as-data modules (syntax-highlight themes, color pickers, sketch swatch
tools, 3D/canvas/terminal color config, provider brand colors) are listed in
`designTokenIgnores`.

---

## Element standards

This table is the standard for every kind of UI element. Each row says which
primitive draws the element, how it looks, and how to check a screen against
it. The numbered sections below hold the detail for each row. When a row and a
section disagree, fix the one that is wrong in the same PR.

A screen meets the standard when:

1. Every element on it is drawn by the primitive its row names.
2. Call sites pass props and layout only (margin, width, flex, grid
   placement). Height, padding, radius, font, colour and border come from the
   primitive or the theme.
3. Its copy follows [Copy](#copy).
4. It reads correctly in the light and the dark theme.

**Check:** `npm run audit:ui` (in `web/`) runs the pattern checks named in the
last column over `web/src` and prints a count per element.
`npm run audit:ui -- --rule <id>` lists every hit of one check. The token rules
(spacing, colour, radius, font size, z-index, motion) are not repeated here,
because `npm run lint:design` enforces them. A check moves into that lint once
its count reaches zero: `lint:design` runs `audit-ui-standards.mjs --check`,
which fails on any hit of a rule in its `ENFORCED` list. Rows without a check are reviewed by eye against the
linked section and the `Patterns/*` Storybook stories.

**Scope:** product UI under `web/src`. The primitives themselves
(`ui_primitives/`, `editor_ui/`) and the theme implement the standard and are
not checked against it. The vendored FableSynth device faces
(`timeline/daw/fablesynth/`) keep their hardware skin so they stay diffable
against upstream. Canvas content that is the user's work (node graph, sketch
layers, 3D scene, timeline clips) is drawn by its editor, but the chrome
around it is not exempt.

### Text and icons

| Element | Use | Look | Check | Detail |
|---|---|---|---|---|
| Text | `Text`, `Label`, `Caption`, `Code`; `TruncatedText` for one-line or clamped text | One of the eight type styles. 15px body, 13px label, 11px caption, 18px title. Weights 400, 500, 600 | `text/raw-typography`, `text/hand-truncation` | [Typography](#1-typography) |
| Icons | `@mui/icons-material`, Outlined variant | Sized by the host primitive, otherwise `fontSize="small"\|"inherit"` or `ICON_SIZE` (14, 16, 18, 20) | `icon/hand-size`, `icon/variant` | [Icons](#icons) |
| Copy | Every visible string | Sentence case, one "…", Delete destroys and Remove detaches, one label per action | `copy/title-case`, `copy/three-dots` | [Copy](#copy) |

### Structure

| Element | Use | Look | Check | Detail |
|---|---|---|---|---|
| Page | `PageLayout`, or `PageHeader` at the top of a page with its own body | `h1` hero strip with icon, subtitle and actions | `text/raw-heading` | [Page layout](#page-layout) |
| Section header | `SectionHeader size="small"` in lists and panels, `FormSection` in forms, `InspectorSection` in properties panels | `EYEBROW`: 11px, uppercase, `0.06em`, `text.secondary` | `text/hand-eyebrow` | [Panels](#10-panels) |
| Panel | `PanelHeader` over a body inset by `SPACING.lg` | 36px title strip, 13px/500 title, 1px `divider` below, `ToolbarIconButton` actions | — | [Panels](#10-panels) |
| Docked panel group | `DockTabStrip` | 28px tab strip, active tab on `background.paper` with a 2px accent | — | [Docked panel groups](#docked-panel-groups) |
| Toolbar, status bar | `Toolbar`, `ToolbarGroup`, `ToolbarDivider`, `StatusBar`, `FloatingToolbar`, `SaveState` | 40px or 28px on `background.paper` with a `divider` rule. Floating bars use the menu paper | `surface/grey-chrome` | [Toolbars and status bars](#toolbars-and-status-bars) |
| Surface | `Surface`, `Card`, `Panel` | `background.paper` or `background.default`, `divider` border. Never `grey[700-900]` | `layout/raw-paper`, `surface/grey-chrome` | [Color](#3-color) |
| Resize handle | `ResizeHandle` | Transparent at rest, `primary.main` while hovered or dragged | — | [Resize handles](#resize-handles) |
| Scroll area | `ScrollArea`, or `scrollbarStyles` / `thinScrollbarStyles` | 10px or 6px scrollbar in `c_scroll_*` | — | [Scrollbars](#9-scrollbars) |
| Collapsible section | `CollapsibleSection`, or `InspectorSection` in a properties panel | Chevron and muted title. Never a filled bar | `layout/raw-accordion` | [Collapsible sections](#collapsible-sections) |

### Overlays

| Element | Use | Look | Check | Detail |
|---|---|---|---|---|
| Dialog | `Dialog`, `ConfirmDialog`, `requestConfirm` | Paper, `divider` frame, `theme.rounded.dialog`, 18px/600 sentence-case title, verb in the confirm button | `dialog/raw-parts`, `dialog/restyled-paper`, `dialog/browser-dialog` | [Dialogs](#dialogs) |
| Menu | `ContextMenu`, `MenuItemPrimitive`, `EditorMenu` | Overlay paper, `BORDER_RADIUS.lg`, `SHADOW.lg`, 180px minimum. 28px rows in 13px/500 | `menu/raw-menu`, `menu/raw-menu-item` | [Menus](#menus) |
| Popover | `Popover` for content that is not a list of choices | Menu paper, `placement`, `maxWidth`, padded `SPACING.lg` | — | [Popovers and sheets](#popovers-and-sheets) |
| Sheet | `MobileBottomSheet` below `md` | Rounded top corners, grip, optional title row | `layout/raw-drawer` | [Popovers and sheets](#popovers-and-sheets) |
| Tooltip | `tooltip` prop of a button primitive, or `Tooltip` | Scrim, `divider` frame, 13px, 300px max, 500ms delay, shortcut as `ShortcutHint` | `tooltip/native-title`, `tooltip/custom-delay`, `tooltip/shortcut-in-text` | [Tooltips](#tooltips) |
| Notification | `addNotification`, `useAlertNotifier` | `AlertBanner` rows in the top-right stack | `notification/snackbar` | [Notifications](#notifications) |

### Controls

| Element | Use | Look | Check | Detail |
|---|---|---|---|---|
| Button | `EditorButton`; `ToolbarIconButton` for icon-only; `CloseButton`, `DeleteButton`, `CopyButton` and the other semantic buttons | `contained` for the one primary action, `outlined` secondary, `text` tertiary. 24/28/32/36px from `density` or `size` | `button/raw-icon-button`, `button/restyled`, `button/icon-fontsize`, `button/native-no-type` | [Buttons](#buttons) |
| Toggle group | `ToggleGroup` (`segmented` in toolbars, `quiet` in node bodies) | Segmented: one 32px pill, `action.selected` when picked | — | [Toggle groups](#toggle-groups) |
| Tabs | `TabGroup` + `TabPanel`; `DockTabStrip` for closable panels | Sentence-case labels, count after the label | `tabs/raw-tabs`, `tabs/hand-tablist` | [Empty, loading and tabs](#empty-loading-and-tabs) |
| Chip | `Chip` | Outlined pill, 28px or 24px `compact`, tone tint at 12% | `chip/restyled`, `chip/hand-pill` | [Chips and pills](#chips-and-pills) |
| Badge, dot, media label | `CountBadge`, `StatusDot`, `MediaLabel` | 16px count pill, 6/8px dot, mono caption on `c_scrim` | — | [Badges, dots and media labels](#badges-dots-and-media-labels) |
| Status | `StatusIndicator` in rows, `StatusPill` on media, `StatusDot` as a bullet, via `GENERATION_STATUS` | In flight `primary`, queued `neutral`, done `success`, stale `warning`, failed `error` | — | [Status](#status) |
| Link | `TextLink`; `ExternalLink` for an off-site URL | `primary.main`, underline on hover | `link/raw-anchor` | [Links and breadcrumbs](#links-and-breadcrumbs) |
| Breadcrumbs | `Breadcrumbs` | 13px, chevron separators, collapses past `maxItems` | — | [Links and breadcrumbs](#links-and-breadcrumbs) |

### Inputs

| Element | Use | Look | Check | Detail |
|---|---|---|---|---|
| Form | `FormSection`, `FormField` | Label 13px `text.secondary` 4px above the field, fields 12px apart, hint in `helperText` | — | [Forms](#13-forms) |
| Text field | `TextInput`, `TextArea`; `NodeTextField` in node bodies | Outlined, height from the field density | `form/raw-text-field`, `form/raw-input`, `form/field-chrome-override` | [Forms](#13-forms) |
| Number field | `NumberField`; `InspectorValueInput` in properties panels | No spinner buttons, unit in mono, optional scrub | `form/number-input` | [Number fields](#number-fields) |
| Select | `SelectField`, `InspectorSelect`, `NodeSelect`; `inputs/Select` for a searchable node property; `Autocomplete` to type ahead | Outlined field, the menu row style below it | `form/raw-select`, `form/native-select` | [Forms](#13-forms) |
| Search field | `SearchInput` | 36px or 28px, search icon, clear button, Escape clears | — | [Search fields](#search-fields) |
| Switch, checkbox, radio | `LabeledSwitch`, `InspectorToggleRow`, `NodeSwitch`; `Checkbox`; `Radio` in a `RadioSet` | 28×16 switch track, 24×12 in node bodies | `form/raw-switch` | [Switches, checkboxes and radios](#switches-checkboxes-and-radios) |
| Slider | `Slider`, `NodeSlider`, `InspectorSliderRow` | Pill rail (6px, 4px compact), primary fill, ring thumb | `form/range-input` | [Sliders](#sliders) |
| Tag input | `TagInput`, `AutocompleteTagInput` | Field with `Chip compact` tags | — | [Forms](#13-forms) |
| Inline rename | `InlineEditableText` | The text's own style, transparent input while editing | — | [Lists and grids](#12-lists-and-grids) |
| Model field | `ModelSelectButton` opening `ModelMenuDialogBase` | Outlined field with the name and its provider | — | [Model picker](#model-picker) |
| Properties panel | `InspectorSection`, `InspectorFieldRow`, `InspectorValueInput`, `InspectorSelect`, `InspectorToggleRow` | 28px rows, label left in 13px, one field density | — | [Properties panels](#11-properties-panels) |
| Drop zone | `DropZone`, or `dropZoneSurfaceStyle` | Idle `1px dashed divider`, over `2px dashed primary` with `action.selected` fill | — | [Drop zones](#drop-zones) |

### Collections and media

| Element | Use | Look | Check | Detail |
|---|---|---|---|---|
| List | `selectableRowStyles`, `ListPanelItem`, `VirtualList` for long lists, `HoverActionGroup` for row actions | Hover `action.hover`, picked `action.selected`, inner 2px focus ring, 13px/500 title, caption second line | `list/raw-list` | [Lists and grids](#12-lists-and-grids) |
| Tree | `TreeRow` | 13px row indented `SPACING.md` per level, list row states | — | [Trees and tables](#trees-and-tables) |
| Grid | `AutoGrid` with `selectableTileStyles` | 1px `divider` frame, picked `primary.main` frame and ring, outer focus ring | — | [Lists and grids](#12-lists-and-grids) |
| Card | `Card`, `StatCard` | `background.paper`, `divider` border, `BORDER_RADIUS.md` | `card/hand-built` | [Cards](#cards) |
| Table | `DataTable` | 13px cells, sticky header, `action.hover` on clickable rows | `table/raw-table` | [Trees and tables](#trees-and-tables) |
| Media thumbnail | `MediaThumbnail`, `ResponsiveImage` | Fixed aspect ratio, cover or contain, type-icon fallback | `media/raw-img` | [Media thumbnails](#media-thumbnails) |
| Viewer | `Dialog variant="fullscreen"` or a panel, with a `Toolbar`, `ZoomControls`, `VideoPlayer`, `AudioPlayback` | One stage colour, controls in a `Toolbar`, Escape closes | `media/raw-video`, `media/raw-audio` | [Viewers](#viewers) |

### States

| Element | Use | Look | Check | Detail |
|---|---|---|---|---|
| Empty | `EmptyState` (`variant="no-results"` for a search) | Icon, a short title that names what is missing, an optional next step | — | [Empty, loading and tabs](#empty-loading-and-tabs) |
| Loading | `LoadingSpinner`; `Skeleton` where the layout is known | Small in a row, medium in a panel, large on a page | `state/raw-spinner`, `state/loading-text` | [Progress and generation status](#progress-and-generation-status) |
| Progress | `ProgressBar`, `ThinkingIndicator`, `MagicGenerationFill` | 6px bar, 4px `small` | `state/raw-linear-progress` | [Progress and generation status](#progress-and-generation-status) |
| Error, banner | `ErrorBanner` for a failure in a surface, `AlertBanner` for a warning or note, `EmptyState variant="error"` in place of content, `useAlertNotifier` for a failed action | Severity tint, `BORDER_RADIUS.lg`, a Report control on every failure | `state/error-text`, `banner/raw-alert` | [Errors and banners](#errors-and-banners) |
| Disabled | The control's `disabled`, plus `disabledReason` or a hint | `text.disabled`; the reason in the tooltip | — | [Tooltips](#tooltips) |

---

## 1. Typography

### Fonts

| Variable | Value | Use |
|---|---|---|
| `var(--fontFamily1)` | `'Inter', Arial, sans-serif` | All UI text |
| `var(--fontFamily2)` | `'JetBrains Mono', 'Inter', Arial, sans-serif` | Code, values, node output |

Write `fontFamily: "var(--fontFamily2)"` for code and values. A literal stack
such as `"monospace"` renders the browser's default monospace font, not
JetBrains Mono. `inherit` is allowed. `design-tokens/font-family-tokens` flags
any other literal `fontFamily` or `font-family` in TSX at **`error`**.

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

{% raw %}
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
{% endraw %}

### Code and monospace text

Mono type (`--fontFamily2`) is for code, values and logs. Three primitives cover it, so nothing sets `fontFamily2` or `monospace` by hand for these roles.

| Need | Primitive |
|---|---|
| A command, path, flag or literal inside a sentence | `Code` |
| Several lines of preformatted text (tool arguments, JSON, a stack trace) | `CodeBlock`, with `language` and `copyable` for a header, `tone="error"` for failures |
| Streaming or accumulated output with levels | `LogView` (`debug`, `info`, `success`, `warning`, `error`; `autoScroll`, `copyable`) |

- Never write a bare `<code>` or `<pre>` with local styles. Use `Code` and `CodeBlock`.
- `CodeBlock` is plain text. Syntax highlighting and SVG preview belong to the chat markdown renderer.
- A virtualised console keeps its own row layout and takes the line style from `LOG_LINE_STYLE` and the level colour from `logLevelColor`.
- Mono text elsewhere (a value in a table cell, a key) uses `Text family="secondary"` or `TYPOGRAPHY.mono.*`.

### Heading Collapse Rule

HTML headings map to two type styles only:
- `h1–h3` → `TYPOGRAPHY.sans.title` (18px / 600)
- `h4–h6` → `TYPOGRAPHY.sans.label` (13px / 500)

Heading **hierarchy** is expressed through margin, letter-spacing, color, and text transform — never by introducing extra font sizes.

### Forbidden

- Any raw `fontSize` px/rem literal: `"14px"`, `"0.85rem"`, `"20px"`, even `"13px"` — reference `var(--fontSize*)` instead
- `fontWeight: 700`, `fontWeight: "bold"`, `fontWeight: 300` — only `400 / 500 / 600`
- A literal font stack: `"monospace"`, `"JetBrains Mono, monospace"`, `"Inter, sans-serif"` — use `var(--fontFamily1)` or `var(--fontFamily2)`
- Mixing a size with a non-sanctioned weight for that role (e.g. 15px / 600)
- A fifth font size anywhere in the app

**Exception:** Icon glyph sizing via relative `em` units (e.g. `<DeleteIcon sx={{ fontSize: "1.2em" }} />`) is icon scaling, not text typography — `em` is only allowed for icons.

### Icons

Every icon comes from `@mui/icons-material`. A role draws the same glyph
everywhere:

| Role | Icon |
|---|---|
| Delete | `DeleteOutline`, or `DeleteButton iconVariant="outline"` for a delete button. Never import `icons/trash.svg` |
| Close | `CloseOutlined` (`CloseButton` already uses it) |
| Add | `AddOutlined` |
| Folder | `FolderOutlined` |
| Edit | `EditOutlined` |
| Info | `InfoOutlined` |

Do not mix in the filled or `Rounded` variant of these.

An icon in a button's `startIcon` or `endIcon`, a menu row or a `ToolbarIconButton` is sized by its container, so pass no size. Any other icon takes `fontSize="small" | "medium" | "inherit"` or an `ICON_SIZE` step. Never write a pixel number.

```tsx
import { ICON_SIZE } from "../ui_primitives";

<InfoOutlinedIcon sx={{ fontSize: ICON_SIZE.sm }} />
```

| Token | px | Use |
|---|---|---|
| `ICON_SIZE.xs` | 14 | Beside caption text, in chips and dense rows |
| `ICON_SIZE.sm` | 16 | Default: toolbars, lists, inline with label text (`MENU_ICON_SIZE`) |
| `ICON_SIZE.md` | 18 | Inline with body or title text |
| `ICON_SIZE.lg` | 20 | Standalone status icons and section headers |

To match the surrounding text, use `fontSize="inherit"` rather than `"1em"`.

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

### TSX: tokens only — no raw px

In `.ts`/`.tsx`, `padding` / `margin` / `gap` must use a token, never a raw px
literal — not even a grid-aligned one. This holds across **every** context:

```tsx
// MUI sx — numeric theme-unit token, or getSpacingPx
<Box sx={{ padding: SPACING.md }} />
<Box sx={{ p: SPACING.md, gap: SPACING.xs }} />

// emotion css() / styled() objects / CSSProperties — getSpacingPx (returns "8px")
css({ padding: getSpacingPx(SPACING.md) })
css({ padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}` })  // shorthand

// styled / css template literals — interpolate getSpacingPx
styled.div`padding: ${getSpacingPx(SPACING.md)};`

// multi-value with theme in scope
createPadding(theme, SPACING.xs, SPACING.md)  // "4px 8px"
```

A handful of structural offsets exceed the scale (max `xxxl` = 32px). Express
those exactly via `getSpacingPx(units)` (e.g. `getSpacingPx(18)` → 72px) rather
than snapping down and changing the layout — the value stays token-derived and
the linter accepts it.

### .css files: use `--spacing-*` vars

Plain `.css` files can't import the TS tokens, so they use the matching CSS
custom properties from [`vars.css`](../web/src/styles/vars.css):

```css
padding: var(--spacing-md);                 /* 8px */
padding: var(--spacing-xs) var(--spacing-md);
margin-left: calc(-1 * var(--spacing-md));  /* negative */
```

`--spacing-none · micro · xs · sm · md · lg · xl · xxl · xxxl` mirror
`SPACING_PX`. `0` stays `0`.

### Enforcement (spacing is fully linted)

Spacing is enforced end-to-end and is currently at **zero** violations:

- **TSX** — the `design-tokens/spacing-tokens` ESLint rule
  ([`eslint.design.mjs`](../web/eslint.design.mjs)) flags raw px on
  `padding`/`margin`/`gap` (incl. logical props, MUI `sx` short props like
  `p`/`mt`, shorthand strings, and px inside `styled`/`css` template literals).
- **CSS** — [`web/scripts/lint-spacing-css.mjs`](../web/scripts/lint-spacing-css.mjs)
  flags raw px in `.css` spacing declarations.

Both run in `npm run lint:design`. Because spacing is clean, keep it that way:
new raw-px spacing will fail the gate.

### Forbidden

`5px`, `7px`, `10px`, `13px`, `20px` and any theme unit not in
`[0, 0.5, 1, 1.5, 2, 3, 4, 6, 8]`. In TSX, **any** raw px on a spacing prop —
even an on-grid one like `"8px"` — is forbidden; use a token.

**Not spacing:** ReactFlow `fitView({ padding })`, viewport ratios, `opacity`, `scale`, `flex` shrink/grow, `zIndex` — these are not layout spacing and are excluded from the rule.

---

## 3. Color

Colors never appear as hardcoded hex or rgb values in component code. Every color reference goes through `theme.vars.palette.*`.

### Semantic Palette (MUI standard)

| Token | Dark | Light | Use |
|---|---|---|---|
| `theme.vars.palette.primary.main` | `#3d68a8` | `#2F62C4` | Primary actions, links |
| `theme.vars.palette.primary.light` | `#5b86c4` | `#4F7FD8` | Hover on primary |
| `theme.vars.palette.primary.dark` | `#2a4d80` | `#244E9E` | Active / pressed primary |
| `theme.vars.palette.secondary.main` | `#E879F9` | `#B13BCF` | Secondary actions |
| `theme.vars.palette.error.main` | `#FF5555` | `#D92D20` | Errors, destructive |
| `theme.vars.palette.warning.main` | `#FFB86C` | `#DC6803` | Warnings |
| `theme.vars.palette.info.main` | `#22D3EE` | `#0E7490` | Information |
| `theme.vars.palette.success.main` | `#50FA7B` | `#16A34A` | Success states |
| `theme.vars.palette.text.primary` | `#F7F8F8` | `#18181B` | Main text |
| `theme.vars.palette.text.secondary` | `#8A8F98` | `#5B5B66` | Secondary / muted text |
| `theme.vars.palette.text.disabled` | `rgba(247,248,248,0.38)` | `#A1A1AA` | Disabled text |
| `theme.vars.palette.background.default` | `#08090A` | `#F5F5F6` | Page background |
| `theme.vars.palette.background.paper` | `#101113` | `#FFFFFF` | Surface / card background |
| `theme.vars.palette.divider` | `rgba(255,255,255,0.08)` | `#E4E4E7` | Borders, dividers |

### Custom Semantic Colors (`c_*`)

NodeTool-specific colors for editor and UI chrome. Reference via `theme.vars.palette.*`.

| Token | Use | Dark | Light |
|---|---|---|---|
| `c_app_header` | App header background | `#0A0B0D` | `#FFFFFF` |
| `c_tabs_header` | Tab bar background | `#101113` | `#F5F5F6` |
| `c_node_menu` | Node context menu bg | `#17181B` | `#FFFFFF` |
| `c_node_bg` | Workflow node background | `#1B1D21` | `#FFFFFF` |
| `c_node_header_bg` | Node header background | `#141518` | `#FFFFFF` |
| `c_node_bg_group` | Group node background | `#22252A` | `#FAFAFB` |
| `c_editor_bg_color` | Canvas background | `#08090A` | `#F6F6F8` |
| `c_editor_grid_color` | Canvas grid lines | `#1F2126` | `#D9D9DF` |
| `c_editor_axis_color` | Canvas axis lines | `#17181B` | `#E4E4E7` |
| `c_selection` | Node selection ring | `#8EACA777` | `#2F62C440` |
| `c_selection_rect` | Marquee selection box | `#cdcdcd33` | `rgba(47,98,196,0.08)` |
| `c_input` | Input handle color | `#2e4a4e` | `#EEF3FB` |
| `c_output` | Output handle color | `#3e3448` | `#F4F0FA` |
| `c_attention` | Attention / highlight | `#E35BFF` | `#B13BCF` |
| `c_delete` | Destructive action | `#FF2222` | `#D92D20` |
| `c_progress` | Progress indicator | `#556611` | `#16A34A` |
| `c_link` | Hyperlink | `#93C5FD` | `#2F62C4` |
| `c_link_visited` | Visited link | `#A5B4FC` | `#6B4FBB` |
| `c_scroll_bg` | Scrollbar track | `transparent` | `transparent` |
| `c_scroll_thumb` | Scrollbar thumb | `#27292E` | `#D4D4D8` |
| `c_scroll_hover` | Scrollbar thumb hover | `#3A3D44` | `#A1A1AA` |

### Greyscale

Indexed from 0 (brightest) to 1000 (darkest) in dark mode; reversed in light mode.

| Index | Dark | Light |
|---|---|---|
| `grey[0]` | `#fff` (white) | `#09090B` |
| `grey[100]` | `#D4D6DB` | `#27272A` |
| `grey[300]` | `#9CA0A8` | `#52525B` |
| `grey[500]` | `#5C606A` | `#A1A1AA` |
| `grey[700]` | `#27292E` | `#E4E4E7` |
| `grey[900]` | `#0A0B0D` | `#F5F5F6` |
| `grey[1000]` | `#000` (black) | `#FFFFFF` |

Semantic grey aliases (`c_gray0` … `c_gray6`) map to the same scale.

### Custom Surface / Glass

| Token | Use | Dark | Light |
|---|---|---|---|
| `Paper.default` | Default paper | `#101113` | `#FFFFFF` |
| `Paper.paper` | Nested paper | `#101113` | `#FAFAFB` |
| `Paper.overlay` | Popover / overlay bg | `#17181B` | `#F2F2F4` |
| `glass.blur` | Backdrop filter | `blur(16px) saturate(180%)` | `blur(20px) saturate(180%)` |
| `glass.backgroundDialog` | Dialog glass bg | `rgba(0,0,0,0.2)` | `rgba(255,255,255,0.72)` |

### Provider Badge Colors

| Token | Use | Dark | Light |
|---|---|---|---|
| `c_provider_api` | API provider badge | `#93C5FD` | `#2F62C4` |
| `c_provider_local` | Local provider badge | `#86EFAC` | `#047857` |
| `c_provider_hf` | HuggingFace badge | `#C4B5FD` | `#7C3AED` |

### Scrims & Surface Overlays

Translucent overlays for the patterns that used to be written as raw
`rgba(0,0,0,a)` / `rgba(255,255,255,a)`. **Scrims** (dark veils over media,
dialogs, hover thumbnails) are intentionally *theme-invariant* — they stay dark
in light mode. **Surface overlays** (subtle raised/inset tints) invert: they
lighten on dark and darken on light.

| Token | Use | Dark | Light |
|---|---|---|---|
| `c_scrim_soft` | Light media/hover veil | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.3)` |
| `c_scrim` | Standard scrim (media, dialogs) | `rgba(0,0,0,0.6)` | `rgba(0,0,0,0.6)` |
| `c_scrim_strong` | Heavy scrim / letterbox | `rgba(0,0,0,0.85)` | `rgba(0,0,0,0.85)` |
| `c_overlay_subtle` | Faint surface tint | `rgba(255,255,255,0.03)` | `rgba(24,24,27,0.025)` |
| `c_overlay` | Raised-surface tint | `rgba(255,255,255,0.06)` | `rgba(24,24,27,0.045)` |
| `c_overlay_strong` | Strong tint / hairline border | `rgba(255,255,255,0.15)` | `rgba(24,24,27,0.09)` |
| `c_shadow_alpha` | Multiplier on every `SHADOW` / `--shadow-*` opacity | `1` | `0.45` |

For a translucent **brand** tint (a primary/warning/info wash), don't add a
token — use the channel form `rgba(var(--palette-<sem>-mainChannel) / <alpha>)`.

### Rules

- **Never hardcode hex or rgb colors** in component code.
- Always reference `theme.vars.palette.*` — the vars switch automatically between light/dark schemes.
  `theme.palette.*` is baked from the default (light) scheme, and `theme.palette.mode`
  is always `"light"`, so neither follows the toggle. `alpha()` cannot take a var: use
  the channel form `` `rgb(${theme.vars.palette.x.mainChannel} / a)` ``. A light/dark
  branch goes through `[theme.getColorSchemeSelector("dark")]: { … }`. A sink that needs a
  literal colour (canvas, three.js, wavesurfer) reads
  `theme.colorSchemes[activeMode].palette` with `useColorScheme()`.
  `design-tokens/static-palette` warns on `theme.palette.*` reads.
- Text on a fixed dark scrim (`c_scrim*`, a black-channel overlay over media) is
  `common.white`, not a `grey[*]` or `text.*` token: those invert in light mode and
  go dark on dark.
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
| `BORDER_RADIUS.lg` | `var(--rounded-lg)` | 8px | Panels, menus (`menuPaperStyles`) |
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

### Enforcement (border radius is fully linted)

Zero violations — locked in at **`error`**. In TSX, `design-tokens/border-radius-tokens` flags any object-literal `borderRadius` that is a magic number, a raw `Npx` string, or a raw `var(--rounded-*)` string; `0` (flush) is allowed. In plain `.css`, `web/scripts/lint-radius-css.mjs` flags any `border-radius` with a raw px/em/rem/% value (use `var(--rounded-*)`; `0` allowed). The one sanctioned raw value is `theme.shape.borderRadius` in `ThemeNodetool.tsx` — MUI's base multiplier, carrying a scoped `eslint-disable`.

---

## 5. Motion

All `transition` and `animation` timing values must use `MOTION.*` constants. Never write raw timing strings.

```tsx
import { MOTION, reducedMotion } from "../ui_primitives";
```

### Duration Tiers

| Token | Value | Use |
|---|---|---|
| `MOTION.fast` | `120ms ease` | Hover micro-interactions, icon state changes |
| `MOTION.normal` | `200ms ease` | Standard UI transitions (color, border, opacity) |
| `MOTION.slow` | `350ms ease` | Panel open/close, drawer animations |
| `MOTION.none` | `"none"` | Disable a transition (use in reduced-motion overrides) |

### Property Shorthands

| Token | Value | Use |
|---|---|---|
| `MOTION.all` | `all 200ms ease` | Multi-property transition shorthand |
| `MOTION.border` | `border-color 200ms ease` | Border color changes |
| `MOTION.background` | `background-color 150ms ease` | Background color changes |
| `MOTION.transform` | `transform 120ms ease` | Scale, translate, rotate |
| `MOTION.opacity` | `opacity 150ms ease` | Fade in/out |
| `MOTION.shadow` | `box-shadow 200ms ease` | Elevation changes |

### Keyframe Loops

Infinite `@keyframes` animations (spinners, pulsing indicators) run on their own
timing — the sub-second `fast`/`normal`/`slow` tiers don't fit a 1–5s loop. Two
tokens carry the duration + easing; compose them with the keyframe name and
iteration.

| Token | Value | Use |
|---|---|---|
| `MOTION.spin` | `1s linear` | Continuous rotation (flowing edges). Loading uses `LoadingSpinner` |
| `MOTION.pulse` | `2s ease-in-out` | Breathing / pulsing status indicators |

{% raw %}
```tsx
sx={{ animation: `${spin} ${MOTION.spin} infinite` }}
sx={{ animation: `${pulse} ${MOTION.pulse} infinite` }}
```
{% endraw %}

### Usage

{% raw %}
```tsx
// Single property
sx={{ transition: MOTION.all }}
sx={{ transition: MOTION.border }}

// Multiple properties (template literal composition)
sx={{ transition: `${MOTION.border}, ${MOTION.shadow}` }}
sx={{ transition: `${MOTION.background}, ${MOTION.opacity}` }}
```
{% endraw %}

### Accessibility — `prefers-reduced-motion` (WCAG 2.3.3)

**Rule: Every component that uses a `transition` on layout, opacity, or transform, or that runs a CSS keyframe animation, must include a `prefers-reduced-motion: reduce` override.**

Use the `reducedMotion()` helper to add the override inline — it returns an Emotion-compatible `@media` block:

```tsx
import { MOTION, reducedMotion } from "../ui_primitives";

// Transition — suppress it entirely
css({
  transition: MOTION.all,
  ...reducedMotion({ transition: MOTION.none }),
})

// Keyframe animation — remove motion, keep visual state
css({
  animation: `${spin} 1s linear infinite`,
  ...reducedMotion({ animation: "none", opacity: 0.6 }),
})

// Multiple transitions
css({
  transition: `${MOTION.border}, ${MOTION.shadow}`,
  ...reducedMotion({ transition: MOTION.none }),
})
```

**What counts as "nonessential" (must be suppressed):**
- Entrance/exit animations (fades, slides, scales)
- Hover transitions on color, border, background, shadow
- Infinite/looping animations (spinners, pulsing indicators)
- Transform transitions (expand/collapse, panel slide-in)

**What does NOT need suppression:**
- State changes that convey information without motion (color alone, icon swap)
- Loading states that go static when `reduce` is set (opacity-only)

Existing components that write `@media (prefers-reduced-motion: reduce)` raw should be migrated to `reducedMotion()` opportunistically.

### Forbidden

Raw timing strings of any kind: `"200ms"`, `"0.2s ease-in-out"`, `"all 150ms linear"`. Compose from `MOTION.*` tokens. Raw `@media (prefers-reduced-motion: reduce) { … }` blocks in new code — use `reducedMotion()` instead.

### Delays and staggers — the one carve-out

The five MOTION tokens describe a *duration + easing* vocabulary; they cannot
express a per-item **delay** or **stagger** offset. So functional delays — a
`transitionDelay`, an `animationDelay`, or the delay slot of an `animation`
shorthand (`${kf} ${MOTION.slow} 80ms backwards`) — are **not** tokenized. Keep
the real millisecond value, but write it as an explicit numeric expression (a
local const or an inline `` `${80}ms` ``) so it reads as data, not a magic
timing string. The lint rule only governs the duration/easing vocabulary, so a
delay expressed this way passes.

A **bare** duration prop that has no easing to bundle (`transitionDuration`,
`animationDuration`) can't take a `MOTION.*` token either (those include the
easing). Use the matching `--motion-*` custom property instead —
`transitionDuration: "var(--motion-normal)"`.

### Enforcement (motion is fully linted at `error`)

In TSX, `design-tokens/motion-tokens` flags any object-literal `transition` / `animation` / `transitionDuration` / `transitionDelay` / `animationDuration` / `animationDelay` whose value carries a non-zero `s`/`ms` timing, and any raw `transition` / `animation` timing inside `styled` / `css` template-literal CSS. In plain `.css`, `web/scripts/lint-motion-css.mjs` flags the same properties (and their `-duration` / `-delay` longhands); `.css` files use the `--motion-*` custom properties from `vars.css` (mirrors of the `MOTION.*` tiers). `0` / `0s` (no delay), keyword-only values (`none`), delays written as numeric expressions (see above), and values built from `MOTION.*` tokens / `var(--motion-*)` are allowed. Both are locked in at **`error`** (zero violations) — a new raw `s`/`ms` timing fails the gate. Inside `ui_primitives/` and `editor_ui/` only `tokens.ts` and `spacing.ts`, which define the tokens, are exempt. Template-literal `@media (prefers-reduced-motion)` blocks (in `css\`\`` styled templates and plain `.css`) stay raw, since `reducedMotion()` is a JS object helper; object-css blocks use `reducedMotion()`.

---

## 6. Depth — Z-Index and Elevation

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
| `theme.zIndex.floatingPanel` | 20000 | Draggable floating panels above editor content (node menu, asset viewer, find-in-workflow dialog) |
| `theme.zIndex.popover2` | 99990 | Secondary popovers (above popover) |
| `theme.zIndex.highest` | 100000 | Emergency top layer |

### Forbidden

Arbitrary integers (`9999` in new component code, `1000`, `2`, `5`) outside of `Z_INDEX.*` or `theme.zIndex.*`.

Plain node handle styles use CSS variables from the theme, exposed by `MuiCssBaseline`:

| CSS variable | Theme value |
|---|---|
| `--z-index-node-handle` | `theme.zIndex.mobileStepper - 1` |
| `--z-index-node-control-handle` | `theme.zIndex.mobileStepper` |
| `--z-index-node-handle-tooltip` | `theme.zIndex.mobileStepper + 1` |
| `--z-index-node-tooltip` | `theme.zIndex.popover2` |

### Enforcement (z-index is fully linted at `error`)

Zero violations — locked in at **`error`**. `design-tokens/zindex-tokens` flags any object-literal `zIndex` whose value is a positive number (or numeric string); `0` (normal flow) and negative values are allowed, as are values built from `Z_INDEX.*` / `theme.zIndex.*`. A few surfaces sit above the shared scale and have no matching tier (e.g. a full-screen compositor modal, the node-info panel); these use a documented module-level constant that preserves the exact stacking value — the rule accepts the named reference, and the constant name records intent. The `.css` surface is not linted (z-index rarely appears in the plain `.css` files); the check is TSX-only.

### SHADOW — elevation

`SHADOW(theme)` is the elevation scale. It is a helper rather than a const map
because the shadow color comes from the palette (`common.blackChannel`), not an
`rgba(0, 0, 0, …)` literal.

```ts
import { SHADOW } from "../ui_primitives";

boxShadow: SHADOW(theme).lg
```

| Token | Value | Use |
|---|---|---|
| `SHADOW(theme).ambient` | `0 0 5px 1px` @ 25% | Halo with no offset — slider thumbs, small round controls |
| `SHADOW(theme).sm` | `0 1px 3px` @ 30% | Resting lift — chips, badges, small buttons |
| `SHADOW(theme).md` | `0 4px 12px` @ 35% | Hover lift, small popovers |
| `SHADOW(theme).lg` | `0 8px 32px` @ 40% | Dropdowns, menus, floating panels, dialogs |
| `SHADOW(theme).xl` | `0 16px 64px` @ 45% | Modals and full-screen overlays |
| `SHADOW(theme).panelLeft` | `4px 0 8px` @ 5% | Left panel's right edge |
| `SHADOW(theme).panelRight` | `-4px 0 8px` @ 5% | Right panel's left edge |

Plain CSS, and code without a theme in scope, uses `var(--shadow-sm)`,
`var(--shadow-md)`, `var(--shadow-lg)` and `var(--shadow-xl)`, defined in
[vars.css](../web/src/styles/vars.css) to mirror the matching `SHADOW(theme)`
tiers. Node handle geometry variables in the same file retain the existing
tooltip widths, offsets and handle hit regions.

### Forbidden

Literal drop shadows — `boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"` — which
hardcode both a depth and a color. Focus and selection rings (`0 0 0 2px
${theme.vars.palette.primary.main}`) and `inset` shadows are borders, not
elevation, and stay outside this scale. `design-tokens/shadow-tokens` enforces
this at **`error`** in TSX: it checks each comma-separated layer of a
`boxShadow` or `box-shadow` value and reports a layer with a raw hex or rgb
color unless that layer is `inset` or a `0 0 0 Npx` ring.

---

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
import { scrollbarStyles, thinScrollbarStyles } from "../ui_primitives";

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

## 10. Panels

Every docked or floating panel uses the same title strip: side panels, bottom
panel views, editor sidebars, agent panels and overlays. Use `PanelHeader`
instead of a hand-built header row.

```tsx
import { PanelHeader, ToolbarIconButton } from "../ui_primitives";

<PanelHeader
  title="Versions"
  count={versions.length}
  docsTopic="debugging"
  actions={<ToolbarIconButton icon={<AddIcon />} tooltip="New version" />}
  onClose={close}
/>
```

| Part | Rule |
|---|---|
| Height | `PANEL_HEADER_HEIGHT` (`CONTROL.height.lg`, 36px) |
| Horizontal padding | `SPACING.lg` (12px), the same inset as the panel body |
| Title | `TYPOGRAPHY.sans.label` (13px / 500), `text.primary`, sentence case, one line |
| Count | `TYPOGRAPHY.sans.caption` (11px / 400), `text.secondary` |
| Divider | 1px `divider` border below the strip |
| Actions | `ToolbarIconButton`s, right-aligned, `SPACING.micro` apart |
| Close | `onClose` renders a small `CloseButton` as the last action |

Below the header, the panel body pads `SPACING.lg` horizontally. A panel that
groups rows uses `SectionHeader size="small"` for each group: caption type,
uppercase, `text.secondary`. A properties panel uses `InspectorSection`, which
draws the same title (see [Properties panels](#11-properties-panels)). Omit `title` only when a tab strip above already
names the panel, as in the agent panels.

### Docked panel groups

An editor whose panels the user rearranges (the game and timeline editors)
docks them in groups. The shared dock lives in `web/src/components/dock/`. Each group draws a `DockTabStrip` and its body. The tab names the
panel, so the panel draws no title strip of its own: its first row is a
toolbar of controls, or its content.

| Part | Rule |
|---|---|
| Tab strip | `DOCK_TAB_HEIGHT` (`CONTROL.height.sm`, 28px), `background.default`, 1px `divider` below |
| Tab | Icon and sentence-case title in `TYPOGRAPHY.sans.label`. The active tab sits on the panel surface (`background.paper`) with a 2px top accent, `primary.main` while focus is inside the group |
| Close | Shown on the active, hovered or focused tab. Middle click and Delete close too. A panel that must stay open passes `closable: false` |
| Group menu | One `ToolbarIconButton` at the end of the strip and the same menu on right click or Shift+F10: close, maximize, split, reorder, move to another dock, add a hidden panel |
| Drag | A tab drags after 4px of travel. `DockDropOverlay` previews the drop: the center adds a tab, an edge splits the group. Escape cancels |
| Panel toolbar | `CONTROL.height.md` (32px), `SPACING.sm` inset, controls right-aligned, 1px `divider` below. Omit it when the panel has no controls |

### Resize handles

Every draggable split, dock edge and resizable window edge uses
`ResizeHandle`. It renders a `role="separator"` strip with pointer capture,
arrow-key resizing (Home and End jump to the bounds) and a focus ring. It
reports deltas through `onResize` and the caller keeps the size.

| Prop | Rule |
|---|---|
| `orientation` | The axis of the bar itself. `vertical` sits between side-by-side panes, `horizontal` between stacked panes |
| `edge` | Omit for an in-flow flex item between panes. `start` or `end` pins the strip to that edge of a positioned parent, as a dock edge or window edge |
| `invert` | Set when the pane's handle is on its leading edge (right dock, bottom dock), so dragging toward the handle's start grows it |
| `thickness` | A `SPACING` step. Default `SPACING.sm` (6px). Use `SPACING.md` for window edges and `SPACING.xxl` for a phone touch target |
| `grip` | Draws a centred pill so a horizontal strip reads as a control at rest. Use it on bottom docks, modal bottoms and phone splits |
| `invisible` | Hit area only, no hover fill. Use it on floating windows with rounded corners (node menu, canvas chat window) |
| `getValue` | Measure the size on grab when it comes from the DOM instead of state |

One look: transparent at rest, `primary.main` while hovered or dragged,
2px `primary` focus ring. A handle does not glow, scale or change its pill
colour on its own.

Do not hand-build a handle from a `div` with `cursor: *-resize`, a
`mousedown` listener and a hover colour. Corner grips that move two axes at
once are the one exception, because `ResizeHandle` has one axis. Canvas
gizmos (crop, transform, rulers) are not panel handles and keep their own
code.

### Dialogs

Dialogs are not panels. Every modal dialog uses the `Dialog` primitive. It
owns the shell, so a dialog only supplies a title, a body and its actions.

```tsx
import { Dialog, Text } from "../ui_primitives";

<Dialog
  open={open}
  onClose={close}
  title="Delete model?"
  maxWidth="xs"
  fullWidth
  onConfirm={remove}
  confirmText="Delete"
  destructive
  isLoading={removing}
>
  <Text size="small">Nodes that use this model stop working.</Text>
</Dialog>
```

| Part | Rule |
|---|---|
| Shell | Paper background, 1px `divider` border, `theme.rounded.dialog` radius, glass backdrop. Do not restyle it through `slotProps`, `PaperProps` or `css`. Caller slot props merge onto the shell |
| Width | `maxWidth="xs"`, `"sm"`, `"md"` or `"lg"` with `fullWidth`. No pixel `minWidth` |
| Title | A sentence-case string in `title`, `TYPOGRAPHY.sans.title` (18px / 600). The close button appears when `onClose` is set. Header extras go in `titleActions` |
| Body | Children render inside the padded content area. Never pass `DialogTitle`, `DialogContent` or `DialogActions` as children |
| Footer | `onConfirm` with a verb in `confirmText`, plus `destructive`, `isLoading`, `confirmDisabled`. Other footers go in `actions` as a fragment of `Button`s: secondary `variant="text" color="inherit"`, the primary last with `variant="contained"` |
| Destructive | Delete, remove, revoke and discard pass `destructive`. Their title is a question and the body states the consequence |
| Feedback | Errors and warnings inside a dialog use `AlertBanner` |
| Confirm only | `ConfirmDialog` for a title, a sentence and two buttons. Never `window.confirm` or `window.prompt`. A hook or callback that renders nothing of its own (a keyboard shortcut, a store action) asks with `await requestConfirm({ title, content, confirmText, destructive })` from `stores/ConfirmStore`, answered by the `ConfirmDialogHost` mounted at the app root |
| Fullscreen | Media viewers and reading views pass `variant="fullscreen"` |

Full-screen editors with their own resize and history (the text, dataframe,
sketch and compositor editors) are workspaces, not dialogs, and keep their own
shells.

### Menus

Context menus, dropdown menus, the list under a select and popover menus share
one surface and one row style. The theme applies them to every MUI `Menu` and
`MenuItem` from
[`menuStyles.ts`](../web/src/components/ui_primitives/menuStyles.ts), so a menu
only supplies its rows.

```tsx
import { ContextMenu, MenuItemPrimitive } from "../ui_primitives";

<ContextMenu open={open} position={position} onClose={close}>
  <MenuItemPrimitive label="Rename" icon={<EditIcon />} shortcut="F2" onClick={rename} />
  <MenuItemPrimitive label="Duplicate" icon={<ContentCopyIcon />} onClick={duplicate} />
  <MenuItemPrimitive label="Delete" icon={<DeleteIcon />} color="error" dividerBefore onClick={remove} />
</ContextMenu>
```

| Part | Rule |
|---|---|
| Menu | `ContextMenu` with `position` for a right-click menu or `anchorEl` for a dropdown. `EditorMenu` in node and editor UI. A select uses `SelectField`, `NodeSelect` or `InspectorSelect`, never a custom list |
| Surface | `menuPaperStyles`: `Paper.overlay` background, 1px `divider` frame, `BORDER_RADIUS.lg`, `SHADOW(theme).lg`, 4px list padding. Do not restyle it through `paperSx`, `slotProps` or `PaperProps`. Those set size and overflow only |
| Width | At least `MENU_MIN_WIDTH` (180px), which `ContextMenu` sets |
| Row | `MenuItemPrimitive`: `TYPOGRAPHY.sans.label` (13px / 500), 28px tall, inset 4px from the frame with `BORDER_RADIUS.sm`. One density. There is no compact or dense row |
| States | Hover and keyboard focus `action.hover`. A picked option `action.selected`, not primary text |
| Label | Sentence case, a verb or the option name: "Delete node", "Add input node". An ellipsis only when the row opens a dialog that asks for more |
| Icon | Optional, 16px, `text.secondary`, 8px before the label. If one row in a group has an icon, give the others one too |
| Secondary line | `secondary`, in caption type and `text.secondary` |
| Shortcut | `shortcut`, right-aligned in `TYPOGRAPHY.mono.caption` and `text.secondary` |
| Submenu | `hasSubmenu` draws the chevron at the end of the row |
| Choices | `checkable="radio"` for one option of a group: the picked row is `selected` and shows a check at the end. `checkable="checkbox"` for a toggle: a check shows when `checked`. Both set `role` and `aria-checked` |
| Destructive | `color="error"` for delete and remove, last in the menu after a divider |
| Groups | `Divider` between groups (4px above and below). A titled group uses `ListSubheader`, which the menu renders as `EYEBROW` in `text.secondary` on the label edge |
| Disabled | `disabled`. Say why in `tooltip` when it is not obvious |
| Popover menus | A popover that lists actions or options is a menu: build it with `ContextMenu` and `MenuItemPrimitive`. Keep `Popover` for content that is not a list of choices, such as a color picker or a form |

Do not wrap a row in a `div` (it breaks arrow-key navigation), build a row
from a button inside a `MenuItem`, or tint the hover with a raw color.

### Popovers and sheets

A popover holds content that is not a list of choices: a colour picker, a
small form, a preview, a settings cluster. A list of actions or options is a
[menu](#menus), even when it opens from a button.

| Part | Rule |
|---|---|
| Primitive | `Popover` with `placement` (default `bottom-left`). It stacks above an enclosing overlay by itself, so pass no `zIndex` |
| Surface | The menu paper: `paperSx={menuPaperStyles(theme)}` until `Popover` applies it by default. Overlay paper, 1px `divider` frame, `BORDER_RADIUS.lg`, `SHADOW.lg` |
| Size | `maxWidth` and `maxHeight` props, or a `width` in `paperSx`. `paperSx` sets size and overflow only |
| Inset | Content pads `SPACING.lg` (12px). A popover that holds a form uses the [form](#13-forms) rhythm and a compact field density |
| Title | Optional. When present, `TYPOGRAPHY.sans.label` in `text.primary` on the first row, with a small `CloseButton` at its end only when the popover has no other way out |
| Dismiss | Click outside and Escape close it. Focus returns to the anchor |

Below `md`, a side panel or a large popover becomes a `MobileBottomSheet`:
rounded top corners, a grip, an optional `title` row with a close button, and
a scrolling body. Do not open a MUI `Drawer` or `SwipeableDrawer` of your own.

### Viewers

A viewer shows one media item large: the asset viewer, a node's result
history, a shot or source viewer, an image compare, a PDF, a 3D model or a
text file. All of them share one shell, so moving between them does not
change where the controls are.

| Part | Rule |
|---|---|
| Container | Full screen: `Dialog variant="fullscreen"`. Docked: a panel with a `PanelHeader` or a dock tab. Do not restyle the dialog paper to change the stage colour |
| Stage | `background.default` behind the media in both themes. Media with transparency sits on the alpha checker (`getAlphaSurfaceBg`). Never `grey[800]`, `grey[900]` or `c_scrim` as the stage |
| Media | Images fit with `object-fit: contain` (`ResponsiveImage`). Video is `VideoPlayer`, audio `AudioPlayback`, 3D `Model3DViewer`, PDF `PDFViewer`, text `TextViewer`. Never a raw `<video>` or `<audio>` |
| Controls | One `Toolbar` (top of a panel) or one `FloatingToolbar` (bottom centre of a full-screen stage). Actions are `ToolbarIconButton`s with tooltips. Order: navigation, zoom, view toggles, then item actions (download, open, delete), then `CloseButton` last |
| Zoom | `ZoomControls` with fit and reset. Wheel and pinch zoom around the pointer. Never a second set of zoom buttons |
| Navigation | Previous and next as `ToolbarIconButton`s, with Left and Right arrow keys. Show the position as `Caption` ("3 of 12") |
| Info | Dimensions, duration and type as `MediaLabel` on the stage or `Caption` in the toolbar |
| Keyboard | Escape closes, arrows move between items, `+` and `-` zoom, `0` fits |
| States | `LoadingSpinner size="medium"` while the media loads. A file that cannot be shown is `EmptyState variant="error"` with a download action |

### Panel composition

Tokens fix the parts. These rules fix how a panel puts them together. The
`Patterns/Panels` stories in Storybook (`web/src/stories/Panels.stories.tsx`)
render each rule at a docked width of 360px. Check a new panel against them.

| Rule | How |
|---|---|
| One field density per panel | A dense panel provides `FieldDensityContext` `"compact"` once at its root. Every `TextInput` and `SelectField` below it then shares one look: 13px control text, `CONTROL.height.sm`, the inspector field surface. Do not mix compact and normal fields in one panel. |
| Words in sans, numbers in mono | Selects and text fields show words in sans. Only numeric and timecode values (`InspectorValueInput`) use mono. |
| The subject outranks the sections | The name of the selected item is the strongest text in the panel. Section and group headers are muted: `text.secondary`, uppercase. |
| Frequent before rare | Properties of the selection come first. Generative and destructive actions come after them, and a long generative section starts collapsed. |
| An action shows its state | A disabled action says why below the button ("Write an instruction"). The cost of a paid action sits on the same line, with two decimals. |
| Text areas start short | A multiline input starts at one row (`minRows={1}`) and grows with its content. |
| Description stays with its label | A setting row puts the label and its description in one column beside the control (`LabeledSwitch`). |
| Three text sizes | A dense panel uses `title` (18px) for the subject, `label` (13px) for labels, values and buttons, and `caption` (11px) for metadata, hints and group headers. `SearchInput` follows the field density too. |
| One control height | Fields, selects, one-row text areas and actions are all `CONTROL.height.sm` (28px). Use `size="small"` buttons in a compact panel. |
| One left edge | Labels, values, section titles and actions start on the content edge. A `CollapsibleSection` in a dense panel uses `iconPosition="end"`. |
| Field rhythm | A label sits 4px above its field. Fields in a form are 12px apart (`gap={3}`), so each label reads with its own field. |
| Tabs fit the panel | Small `TabGroup` tabs must all fit at 360px. Shorten the labels or drop the icons before the strip has to scroll. |

### Collapsible sections

A section the user can fold is `CollapsibleSection`. In a properties panel it
is `InspectorSection`, which draws the same header.

| Part | Rule |
|---|---|
| Header | Chevron and title on one row. The title is `EYEBROW` in `text.secondary` in a dense panel and `TYPOGRAPHY.sans.label` elsewhere. Never a filled bar, a bright `text.primary` title or wider letter spacing |
| Chevron | `iconPosition="end"` in a dense panel so titles keep the content edge, `start` elsewhere. Points right when closed and down when open |
| State | A section the user folds stays folded on that surface. A long or rare section starts closed |
| Keyboard | The header is a button with `aria-expanded` |

Do not use MUI `Accordion` for this. A disclosure button that shows more of a
single item is `ExpandCollapseButton`.

### Page layout

Every full page (a manager, a dashboard, a list surface) gets its title block
from `PageHeader` in `ui_primitives`. Do not build a header from a raw `<h1>`,
`Text size="big"` or a hand-written flex row with its own padding.

| Primitive | Use |
|---|---|
| `PageLayout` | Full-screen chrome for a manager page: a `PageHeader` hero, then the rest of the viewport for the children. `padded` (default) pads and scrolls the content, `padded={false}` leaves a full-bleed layout to the child, `scrollable` scrolls without padding, `showHeader={false}` keeps the layout and drops the header. |
| `PageHeader` | The page's `h1` with an optional `icon`, `subtitle`, `actions` and a docs button (`docsTopic` or `docsUrl`). `variant="hero"` (default) is the tinted icon chip over a gradient strip with a rule below. `variant="bar"` is the same strip without the gradient and with an unframed icon. `variant="plain"` has no padding, rule or background: place it in your own layout and set spacing through `sx`. |

Rules:

- A page with the manager look is a `PageLayout`. A page with its own body
  layout (tutorials, a dashboard) renders `PageHeader` at the top of it.
- A centred card or a one-screen consent flow is not a page layout. Use
  `PageHeader variant="plain"` for its title, or no header.
- A detail heading inside a page (a selected package or model) is not a page
  header. Use `Text` with `size="big"`.
- `subtitle` is one line. Use `hideSubtitleOnMobile` when the actions need the
  room below `md`.
- Section headings inside a page are `Text component="h2"` or `SectionHeader`,
  never a raw `<h2>` or `<h3>` styled in a CSS block.

### Toolbars and status bars

Every editor's top bar, bottom bar and floating bar comes from these
primitives in `ui_primitives`. Do not build a bar from a `FlexRow` plus a
hand-written background, border and height.

| Primitive | Use |
|---|---|
| `Toolbar` | The strip above or below an editor surface. `position="top"` (default) rules its bottom edge, `position="bottom"` its top edge, both with the `divider` color on `background.paper`. `density="normal"` is 40px, `density="compact"` is 28px. Padding is `SPACING.md` on the sides and the gap is `SPACING.sm`. |
| `ToolbarGroup`, `ToolbarDivider` | A cluster of related controls (4px gap) and the vertical rule between clusters. Never draw a divider with `borderLeft` or a pseudo-element. |
| `StatusBar`, `StatusBarItem` | The bottom strip for selection, hints, counts and zoom. A compact bottom `Toolbar` with caption type in `text.secondary`. `StatusBarItem grow` is the one item that takes the free width and truncates. |
| `SaveState` | The one save readout: `state="dirty"` is an 8px `warning.main` dot, `saving` a small spinner, `saved` a `success.main` dot, `error` an `error.main` dot. `showLabel={false}` keeps only the dot (labelled for screen readers) when the Save button beside it already says "Saving…". Override the text with `labels`. |
| `FloatingToolbar` | A bar over a selection, a hovered card or a node. It uses the menu paper (`menuPaperStyles`): overlay paper, divider frame, `BORDER_RADIUS.lg`, `SHADOW.lg`. The caller owns position, z-index and visibility. |

Rules:

- A top or bottom bar is a `Toolbar`. A floating bar is a `FloatingToolbar`.
  Any other surface that floats (a compose card, a pill) spreads
  `menuPaperStyles(theme)` instead of picking its own radius and shadow.
- Pass layout through `sx`, never through an Emotion `css` prop. `Toolbar`'s own
  `sx` wins over a `css` class on the same element.
- Do not use `grey[700]`, `grey[800]` or `grey[900]` for a bar's border or
  background, or a translucent background with `backdropFilter`.
- Do not copy a `.dirty-dot` block. Render `SaveState`.
- A bar taller than its density (a stacked two-row header) overrides
  `flexDirection` and `px` in `sx` but keeps the surface and rule.

---

## 11. Properties panels

A properties panel edits the selected object: the node inspector, the timeline
clip inspector, the 3D model and game inspectors, and the sketch side panel.
They share one set of primitives, so a field looks and behaves the same in
every editor.

```tsx
import { InspectorFieldRow, InspectorSection, InspectorValueInput } from "../ui_primitives";

<InspectorSection title="Transform" divider={false}>
  <InspectorFieldRow label="Opacity">
    <InspectorValueInput value={String(opacity)} unit="%" onCommit={commitOpacity}
      scrub={{ step: 1, min: 0, max: 100 }} />
  </InspectorFieldRow>
</InspectorSection>
```

| Part | Rule |
|---|---|
| Group | `InspectorSection`: a collapsible group with a 1px divider above it. Pass `divider={false}` for the first group |
| Group title | `EYEBROW` (11px caption, uppercase, `0.06em`), `text.secondary`. `InspectorSectionTitle` renders it when the fold is not an `InspectorSection` |
| Group extras | An activation checkbox (`checked`, `onCheckedChange`) or one trailing `action`, such as reset or remove |
| Row | `InspectorFieldRow`: label left in `TYPOGRAPHY.sans.label`, controls right, `CONTROL.height.sm` tall |
| Labels | Sentence case: "Cast shadow", not "Cast Shadow" |
| Numbers | `InspectorValueInput`. Pass `scrub` for drag-to-change and `scrubGesture` to merge a drag into one undo entry |
| Choices | `InspectorSelect` |
| Booleans | `InspectorToggleRow` |
| Read-only values | `InspectorStaticValue`: mono, `text.secondary`, truncated with the full value as its tooltip |
| Body inset | The panel body pads `SPACING.lg` (12px) or `SPACING.md` (8px) horizontally, and sections sit inside that inset |

Do not restyle a `CollapsibleSection` header into a filled bar, a bright
`text.primary` title or a wider letter spacing. A nested object inside a group
(a sub-object of a game component, for example) may keep a plain
`Label` title, so the hierarchy stays two levels deep.

---

## 12. Lists and grids

A list shows rows: sidebar documents, workflows, assets, models, versions,
threads. A grid shows tiles: assets, templates, examples, projects, setup
choices, generated takes. Each shares one set of interaction states, from
[`selectionStyles.ts`](../web/src/components/ui_primitives/selectionStyles.ts),
so hover, selection and keyboard focus look the same everywhere.

```tsx
import { AutoGrid, selectableRowStyles, selectableTileStyles } from "../ui_primitives";

<Box sx={(theme) => selectableRowStyles(theme, { selected })} />
<AutoGrid minItemWidth={160}>
  {items.map((item) => (
    <Box key={item.id} component="button"
      sx={(theme) => selectableTileStyles(theme, { selected: item.id === id })} />
  ))}
</AutoGrid>
```

| Part | Rule |
|---|---|
| Row states | `selectableRowStyles`: `action.hover` on hover, `action.selected` when picked, `BORDER_RADIUS.md` |
| Tile states | `selectableTileStyles`: 1px `divider` frame, `BORDER_RADIUS.md`. Picked: `primary.main` frame plus a 1px ring. Hover: `action.hover` |
| Focus | `focusRing`: 2px `primary.main`. Rows draw it inside (offset -2), because a scrolling list clips it. Tiles draw it outside (offset 2) |
| Row title | `TYPOGRAPHY.sans.label` (13px / 500). A row's secondary line is `Caption` |
| Tile title | `TYPOGRAPHY.sans.label`. Metadata under it is `Caption` |
| Group headers | `EYEBROW` in `text.secondary`, left-aligned with the rows: date groups, providers, asset types, namespaces. `SectionHeader size="small"` renders it |
| Type groups | A long mixed list (the asset browser) groups by file type. The header is a button: chevron, type icon, label and count. Collapsed groups are remembered per surface. A row of `Chip`s above the list filters to one type, with counts |
| Grid | `AutoGrid`. It caps the minimum column at the container width, so one tile fits a narrow panel |
| Long lists | `VirtualList` |
| Media | `ResponsiveImage` with `preferThumbnail`, and `loading="lazy"` in a long list |
| Empty, error, loading | `EmptyState` (with `variant="error"`) and `LoadingSpinner` |
| Hover actions | `HoverActionGroup`, which also shows on keyboard focus |

Do not use a raw `rgba(255, 255, 255, a)` hover, a primary-tinted selected row,
a shadow or lift as the only hover cue, or a second selected treatment. The
one exception is `SelectableListItem`, whose left bar marks a second,
dashed state such as a comparison target in version history.

### Cards

A card is always `Card` (from `ui_primitives`), never a hand-built `div` with a
border, radius and background. One card has one radius, one background
(`background.paper`) and one `divider` border.

| Use | Primitive |
|---|---|
| Content tile or panel | `Card` (`variant="outlined"` for a frame; `radius` is `md` by default, `sm` or `lg` when the surface needs it) |
| Clickable tile | `Card hoverable clickable`, or `component="button"` for a native button |
| Card in the chat message stream (approvals, requests, summaries) | `Card variant="inline"`: `lg` radius, no padding, so the rows carry their own. Build it from `CardHeader` (icon, title, subtitle, trailing), `CardBody` and `CardActions` (divider above, wraps) |
| Tint that carries meaning | `tone="info"` (a proposal to review) or `tone="warning"` (a decision is needed, 3px edge). Never decorative |
| Labelled figure (costs, storage) | `StatCard`: `label`, `value`, optional `decimal`, `icon`, `delta`, `hint`. `layout="plain"` is the bare stack for a toolbar or hero |

Do not write a card container with `borderRadius`, `border` and
`backgroundColor` by hand, override a card with `grey[*]` colours, or define
your own `stat-value` and `stat-label` styles. A row in a framed dialog list
(`ProviderOnboardingCard`) is a `Card` with `borderRadius: 0` and a divider
between rows, because the list owns the frame.

### Media thumbnails

A tile that shows stored media is `MediaThumbnail` (from `ui_primitives`),
never a switch on `content_type.startsWith("image" | "video" | "audio")` that
picks an `<img>`, a `<video>` or an icon by hand.

| Use | Primitive |
|---|---|
| Thumbnail of an `Asset` record | `MediaThumbnail asset={asset} alt="…"`: image uses `thumb_url` then `get_url`, video its `thumb_url` poster, anything else a type icon |
| Thumbnail of a media ref or locator | `MediaThumbnail locator={ref} alt="…"`: resolved through the media-resolution boundary. Pass `kind` or `contentType` when known, otherwise the asset row decides |
| Playable tile | add `interactive`: video renders `VideoPlayer`, audio `AudioPlayback` |
| Caption on the tile | `label` slot (bottom scrim, pointer events off). Pass a `MediaLabel` or any node |
| Remove or open controls | `actions` slot (top right, revealed on hover and keyboard focus) |
| Node-body image preview with a checker empty state | `ImagePreview` from `node_types/editing/ImagePreview` |

The tile keeps its aspect ratio (`aspectRatio`, default `1/1`), fills with
`fit="cover"` or `"contain"`, and falls back to an icon (`icon` overrides it).
Never put an `asset://` string in `src`, and never use a video file as an image
source.

Do not hand-build a media tile with an `<img>`, a `background-image` or a
scrim `div`, and do not paste an `ImageRefPreview` with a `CheckerDropzone`
placeholder into a node body.

### Trees and tables

A tree row (asset folders, the workspace explorer, a scene graph, layers) is
`TreeRow`. It draws `TYPOGRAPHY.sans.label`, indents `SPACING.md` per level,
and uses the list row states: `action.hover` on hover, `action.selected` when
picked, a 2px `primary` focus ring. The editor owns expansion, selection and
drag. The disclosure chevron is 16px in `text.secondary`, and leaf rows keep
its space so names line up.

Tabular data is `DataTable`. Column headers are `TYPOGRAPHY.sans.caption` in
`text.secondary`, cells `TYPOGRAPHY.sans.label`, numbers right-aligned in
`TYPOGRAPHY.mono.label`. `compact` in a panel, `stickyHeader` with a
`maxHeight` when the table scrolls, and `onRowClick` turns on the row hover. A
spreadsheet the user edits (the dataframe editor) is an editor, not a table,
and keeps its own grid.

---

## 13. Forms

A form collects input: the settings pages, workflow settings, collection and
profile forms, and the fields inside dialogs and setup steps. Every field is
built from `TextInput`, `SelectField` or `FormField`, so a label, a hint and an
error look the same in every form.

```tsx
import { FormField, FormSection, LabeledSwitch, SelectField, TextInput } from "../ui_primitives";

<FormSection label="Execution">
  <SelectField label="Run mode" value={mode} onChange={setMode} options={MODES}
    description="How the workflow starts" />
  <TextInput label="Tool name" value={toolName} onChange={onToolName}
    helperText="Letters, numbers and underscores" errorMessage={toolNameError} />
  <FormField label="Workspace" helperText="Folder the agent can read">
    <WorkspacePicker value={workspace} onChange={setWorkspace} />
  </FormField>
  <LabeledSwitch label="Autosave" description="Save after every change"
    checked={autosave} onChange={setAutosave} />
</FormSection>
```

| Part | Rule |
|---|---|
| Label | The `label` prop of `TextInput` or `SelectField`: `TYPOGRAPHY.sans.label` in `text.secondary`, 4px above the control. Any other control (a picker, slider, chip set) goes inside `FormField label`. Never a `Text`, `Caption` or `Label` placed beside the field. A field without a visible label still passes `label` with `hideLabel` |
| One label | A labeled `FormField` already names its child. Do not also pass `label` to the `SelectField` or `TextInput` inside it, and do not wrap a `hideLabel` select in a `FormField` when the select can carry the label |
| Hint | `helperText` on `TextInput` and `FormField`, `description` on `SelectField` and `LabeledSwitch`. Not a sibling `Caption` |
| Error | A field error goes in `errorMessage` (`TextInput`) or `error` (`FormField`). An error about the whole form is an `AlertBanner` |
| Rhythm | Fields are 12px apart: `FormSection`, or a column with `gap={SPACING.lg}` |
| Groups | `FormSection label`: the `EYEBROW` style in `text.secondary`. `Label` names a field, never a group. No tinted or bordered box around a group of fields |
| Booleans | `LabeledSwitch` with the explanation in `description`, not a bare `Switch` or `Checkbox` beside text |
| Switch look | The theme draws every `Switch` the same: a pill track that turns `primary` when on, 28×16 with a 12px thumb. Node bodies (`NodeSwitch`) draw it at 24×12. Do not restyle a switch through `sx` or a local `.MuiSwitch-*` rule |
| Field chrome | Fields keep their primitive look. Do not override `.MuiOutlinedInput-*`, `.MuiInputBase-*`, `.MuiSelect-*` or `.MuiInputLabel-*` from a form's `css` or `sx`. A form may set a field's width only |
| Variant | Outlined fields everywhere. A dense panel sets `FieldDensityContext` once (see [Panel composition](#panel-composition)) |
| Text | Labels and options are sentence case ("Tool name", "Ask every time"). Acronyms keep their case ("API key", "ID") |

### Search fields

Use `SearchInput` from `ui_primitives` for every search or filter box. It owns the look (36px field, 28px with `size="small"`), the search icon, the clear button, optional debounce, and Escape-to-clear.

- Wrap it, do not rebuild it. Hosts that need their own debounce, arrow-key navigation or a mode switch pass `onKeyDown`, `escapeClears={false}`, `startAdornment`, `loading`, `endHint` and `inputProps` instead of drawing a second field. `components/search/SearchInput.tsx` (node menu) and `assets/AssetSearchInput.tsx` are wrappers of this kind.
- Do not build a search box from a raw `<input>`, a MUI `TextField` or a bare `InputBase`. Find/replace fields that carry validation state keep `NodeTextField`.
- The clear button appears only when there is a value, and focus returns to the field after a clear.
- Placeholders name what is searched in sentence case: "Search workflows", "Search nodes", "Filter models". No trailing "..." or "…". Give a field with no visible label an accessible name (`ariaLabel` defaults to the placeholder).

### Sliders

There is one slider: `Slider` from `ui_primitives`. It owns the rail, track and thumb look (rounded pill rail, primary fill, ring thumb). `NodeSlider` (adds `nodrag`, compact by default, `changed`) and `AdjustmentSlider` / `InspectorSliderRow` are thin wrappers over it.

| Rule | Detail |
|---|---|
| Density | `density="normal"` (6px rail) for app UI; `density="compact"` (4px rail) for node bodies, inspectors and tool panels. `size="small"` also means compact |
| Layout | `layout="inline"` (default) is the bare track. `layout="row"` is `label`, track, `display` readout. Use `NodeSlider` inside node bodies so the canvas does not drag |
| Default marker | `changed={value !== default}`: neutral thumb at the default, primary thumb otherwise |
| Bipolar | `origin={0}` for a range with a neutral point: the fill grows from it and a tick marks it. `resetValue` (or `origin`) gives double-click reset |
| Behaviour | `onChange` for live updates, `onChangeCommitted` for the undo step. The primitive never changes either |
| Forbidden | `type="range"` inputs, `sx` / `css` that restyle `.MuiSlider-rail`, `-track` or `-thumb`, a local `*SliderSx`, or a new slider wrapper. Sibling node bodies use the same slider |

### Switches, checkboxes and radios

| Choice | Use |
|---|---|
| A setting that takes effect at once | `LabeledSwitch` with the explanation in `description`. In a properties panel `InspectorToggleRow`, in a node body `NodeSwitch` |
| An item picked for a later action (rows to delete, files to import) or a consent | `Checkbox` with `label` |
| One of a few options that should all stay visible | `Radio` in a `RadioSet` |
| One of a few options in a toolbar or a compact panel | `ToggleGroup segmented` (see [Toggle groups](#toggle-groups)) |
| One of many options | `SelectField` |

The control sits before its label for a checkbox or radio, and after it for a
switch, so the label and description read as one column. A bare `Switch`
next to a `Text` is a deviation.

---

## 14. Controls

Buttons, tooltips, notifications, chips, empty and loading states, tabs and the other small controls every surface shares.

### Copy

The words on controls follow one set of rules, wherever they appear: labels,
menu items, tooltips, `aria-label`s, buttons, headings, settings sections and
placeholders. Prose rules live in [WRITING_STYLE.md](WRITING_STYLE.md) and the
voice in [BRAND.md](BRAND.md).

| Part | Rule |
|---|---|
| Case | Sentence case: "Default models", "Take screenshot", "Duplicate layer", never "Default Models". Proper nouns, product and provider names keep their case ("NodeTool", "OpenAI", "ComfyUI", "Hugging Face"), and so do acronyms ("API key", "3D model"). Node titles are names and keep the case the node defines ("Text To Image") |
| Ellipsis | One "…" character, never three dots: "Saving…", "Type or select…". On a menu row or button it means the action asks for more before it runs |
| Delete | The action destroys the thing: a layer, a track, a version, a file, a note, a keyframe. "Delete layer", "Delete track?" |
| Remove | The action takes the thing out of a container and it still exists elsewhere: from favorites, a group, a queue or a folder; an attached file or reference; a tag; a vault or workspace whose files stay on disk; something applied to an object, such as an effect, a transition or a mask designation. "Remove from favorites", "Remove reference" |
| Copy | A copy tooltip or label is "Copy" plus the thing: "Copy message", "Copy error", "Copy link". Never "Copy to clipboard" or "Copy the …". `CopyButton` defaults to "Copy" |
| Same action, same words | One action has one label in every place it appears. A menu row, its toolbar button and its shortcut entry read the same |

Only the visible text follows these rules. Ids, persisted keys, enum values
and strings sent to the server or the agent keep their spelling.

### Tooltips

A tooltip names an icon button or explains a control. Every tooltip uses the
`Tooltip` primitive or the `tooltip` prop of a button primitive
(`ToolbarIconButton`, `EditorButton`, `CloseButton`), so it waits, looks and
reads the same everywhere.

```tsx
import { EditorButton, Tooltip, ToolbarIconButton } from "../ui_primitives";

<ToolbarIconButton icon={<UndoIcon />} tooltip="Undo" shortcut={["Ctrl", "Z"]} onClick={undo} />
<EditorButton tooltip="Render a new still and pick its model" onClick={regenerate}>
  New still
</EditorButton>
<Tooltip title="Previous match" shortcut={["Shift", "Enter"]} describeChild>
  <button type="button" aria-label="Previous match" onClick={previous} />
</Tooltip>
```

| Part | Rule |
|---|---|
| Delay | `TOOLTIP_ENTER_DELAY` (500ms) to open and `TOOLTIP_ENTER_NEXT_DELAY` (100ms) when another tooltip just closed. The theme sets both on every MUI Tooltip, so pass no delay. A long description that would get in the way of a pointer passing over passes `TOOLTIP_DESCRIPTION_DELAY` (1s) |
| Surface | The theme's: scrim background, 1px `divider` frame, `TYPOGRAPHY.sans.label`, 300px wide at most, no arrow. Do not restyle it through `slotProps`. A rich preview (an image card under a mention chip) may clear the padding and background |
| Text | Sentence case, no closing period: "Reload schema", "Toggle panel". A verb for an action, a noun for a value |
| Shortcut | Pass `shortcut` and the tooltip draws the keys as a `ShortcutHint` below the title. Do not write "(Ctrl+Z)", "\| Esc" or "(X)" into the text |
| Native `title` | Not on a button or other control. A native title ignores the delay and the theme and never shows on keyboard focus. Use `tooltip` on `EditorButton` or wrap the element in `Tooltip` |
| Label or description | An icon-only button takes its name from its `aria-label` or the tooltip. A button with a visible label passes `describeChild` (built into `EditorButton tooltip`), so the tooltip describes the button instead of renaming it |
| Disabled | A disabled button shows no tooltip unless it sits in a wrapper. `EditorButton tooltip` adds the wrapper. Say why the button is disabled when the reason is not obvious |
| One per control | Never nest a `Tooltip` around a primitive that already has `tooltip` or `title` |

### Notifications

Transient feedback, such as a saved file, a failed render or a refused run,
goes to one notification stack in the top right corner of the workspace. Post
to it through the notification store. Never mount a `Snackbar` of your own.

```tsx
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAlertNotifier } from "../../hooks/useAlertNotifier";

const addNotification = useNotificationStore((s) => s.addNotification);
addNotification({ type: "success", alert: true, content: "Imported Launch film" });

// A failure from an action, in place of a local error state and its toast
const reportError = useAlertNotifier("error");
reportError(err instanceof Error ? err.message : "Failed to generate");
```

| Part | Rule |
|---|---|
| Surface | The stack that `node_editor/Alert` renders: `AlertBanner` rows, newest last, 440px wide at most, full width between gutters on a phone. An error carries a Copy control |
| Type | `success` for a finished action, `info` for news, `warning` when the action ran but something is missing, `error` when it failed. Pass `alert: true` so the notification pops up and is not only added to the bell's list |
| Text | One sentence, sentence case, saying what happened: "Imported Launch film", "Unlock a video track first." Name the thing, not the component |
| Timeout | Leave `timeout` out. The store sizes it from the message length (3s to 12s). `0` keeps a notification until it is dismissed, and job completions use `NOTIFICATION_TIMEOUT_JOB_COMPLETED` |
| Repeats | Pass a `dedupeKey` (with `replaceExisting` for a value that changes, such as progress) instead of stacking the same message |
| Inline errors | An error about a form or a dialog stays inline as an `AlertBanner` in that surface, not in the stack |

### Chips and pills

A chip is a short tag, count or filter. Draw it with the `Chip` primitive. The
theme's `MuiChip` override sets its height, radius, text and tone tints, so a
call site picks props and adds only layout through `sx`, such as a margin or
`flexShrink`.

```tsx
import { Chip } from "../ui_primitives";

<Chip label="Installed" compact color="success" />
<Chip label="Images" compact active={format === "image"} onClick={pickImages} />
<Chip label={shot.slug} compact accent={BOARD_COLOR} onClick={openShot} />
```

| Part | Rule |
|---|---|
| Shape | Outlined pill, 28px tall, 24px with `compact`. Never set `height`, `borderRadius`, `fontSize` or label padding on a chip |
| Tone | `color` picks a palette tone: text in the main colour, border at 50%, fill at 12%, as `StatusPill` draws it. A neutral chip is `text.secondary` on a `divider` border. A surface's own colour (a storyboard link, an entity kind, a type) goes in `accent`, never in `sx` |
| Selected | A filter or toggle chip passes `active`. Selected takes its tone (primary when none is given) and unselected stays neutral. A clickable chip gets `aria-pressed` from it, so do not pass one |
| Text | Sentence case, a few words. Values such as a type name or a hex colour may use `TYPOGRAPHY.mono.caption` |
| Not a chip | A count or a value with no border is `Text`. A render state on a thumbnail is `StatusPill`. A command is a button, even when it is pill-shaped |
| Hand-built | Do not build a pill from a `Box`, `span` or `button` with `BORDER_RADIUS.pill`. Use `Chip` with `icon` for a leading dot, spinner or icon |

### Badges, dots and media labels

Three primitives cover the small marks that sit beside or on top of other
content. A text badge is a `Chip`, see "Chips and pills".

```tsx
import { CountBadge, StatusDot, MediaLabel } from "../ui_primitives";

<CountBadge count={unread} max={99}><BellIcon /></CountBadge>
<StatusDot tone="warning" label="Unsaved changes" />
<StatusDot tone="primary" pulse />
<MediaLabel corner="bottom-right">{width} × {height}</MediaLabel>
```

| Part | Rule |
|---|---|
| `CountBadge` | A number on an icon or button. With children it anchors to them (MUI `Badge`). Without children it is a standalone 16px pill, positioned through `sx`. `max` caps the number as "99+", `dot` drops the number, `size` is `small` or `medium` |
| `StatusDot` | A filled circle that carries a state by colour: unsaved, generating, failed, connected. `tone` is a palette tone or `neutral`, `size` is `small` (6px) or `medium` (8px). `pulse` breathes it on `MOTION.pulse` for ongoing work and stops under reduced motion. Pass `label` when the dot is the only signal, otherwise it is `aria-hidden` |
| `MediaLabel` | A readout on an image or video, such as dimensions or duration: mono caption, white on `c_scrim`. `corner` pins it to a corner of the positioned parent and disables pointer events. Never put it on a surface that is not media |
| Text badge | `Chip compact`, never a styled `span` |
| Hand-built | Do not draw a dot from a `Box`, `span` or `::before` with `BORDER_RADIUS.circle`, copy a `.dirty-dot` or `.dimensions-badge` rule, or write a `@keyframes` for a pulsing dot. A custom colour goes in `sx={{ bgcolor }}` on `StatusDot`. A dot with a label is `SaveState` or `StatusIndicator` |

#### Status

One state has one colour, whichever primitive draws it. Work in flight
(generating, rendering, provisioning) is `primary`. Work waiting its turn is
`neutral`. Done is `success`, a warning or stale result is `warning`, and a
failure is `error`.

| Where | Primitive |
|---|---|
| Inline in a row or header, with a label | `StatusIndicator` (`status="running"` for work in flight, `"pending"` for queued). Its dot is a `StatusDot` |
| On a media card or thumbnail corner | `StatusPill` |
| A list bullet or a dot with no room for a label | `StatusDot` |

A generated item (sketch layer, timeline clip) maps its state through
`GENERATION_STATUS`, which gives the `status`, `pill` and `dot` value for each
state. Do not write a new state-to-colour table.

### Buttons

A command is a button. Draw a text command with `EditorButton`, an icon-only
command with `ToolbarIconButton`, and a close, delete, copy or similar action
with its semantic button (`CloseButton`, `DeleteButton`, `CopyButton`). The
theme's `MuiButton` override sets text size and icon size per button size, so
a call site picks props and adds only layout through `sx`.

```tsx
import { CloseButton, EditorButton } from "../ui_primitives";

<EditorButton variant="contained" onClick={install}>Install</EditorButton>
<EditorButton variant="outlined" startIcon={<AddIcon />} onClick={add}>Add</EditorButton>
<EditorButton variant="text" color="inherit" onClick={dismiss}>Dismiss</EditorButton>
<CloseButton onClick={onClose} tooltip="Close documentation" />
```

| Part | Rule |
|---|---|
| Emphasis | `contained` for the one primary action in a view, `outlined` for secondary actions, `text` for tertiary ones such as Dismiss or Back. A muted tertiary action adds `color="inherit"` |
| Size | `density` (24px compact, 28px normal) or `size` (28, 32, 36px). Never set `height`, `padding`, `borderRadius` or `fontSize` on a button |
| Icons | `startIcon` and `endIcon` take a bare icon. The theme sizes it at 16, 18 or 20px for small, medium and large, so never pass `fontSize` to the icon |
| Tooltip | Pass `tooltip` to the button instead of wrapping it in `Tooltip` |
| Native button | Only for a tile, card or swatch whose whole surface is the hit target. It keeps a visible focus ring and `type="button"` |
| Not a button | A tag or filter is a `Chip`. A command stays a button even when it is pill-shaped |

### Toggle groups

A set of two to five mutually exclusive views or modes (grid or list, a
scope filter, a tool mode) is `ToggleGroup` with `ToggleOption`s.

| Context | Variant |
|---|---|
| Toolbar or page header | `segmented`: one bordered 32px pill, sentence-case 13px labels, `action.selected` on the picked option |
| Node body or dense tool panel | `quiet`: no frame, 24px options, filled when picked |
| Elsewhere | default, `compact` in a dense panel |

An option shows a label, an icon with a tooltip, or both, and the same choice
for every option in the group. A group that switches between whole views of a
panel is a [tab strip](#empty-loading-and-tabs), not a toggle group. Do not
rebuild one from `EditorButton`s with a selected style.

### Number fields

Use `NumberField` (`ui_primitives/NumberField.tsx`) for every number a person types in a dialog, form or panel. It is a `TextInput type="number"` with `min`, `max` and `step`, a `unit` suffix (`%`, `px`, `ms`), optional `scrub` (drag the unfocused field sideways; Shift x10, Alt x0.1) and the field density of the surface (`FieldDensityContext`). One focus ring, no native spinner buttons (ArrowUp/ArrowDown still step), units in the mono label style.

- It keeps the value as text and reports it through `onChange` (native event) or `onValueChange` (raw text). Parse and clamp in the owner, on blur or Enter, as before.
- All number fields share one look: `numberFieldSurfaceStyles(theme, density, focused)` (height per density, field background, border, radius, primary-border focus ring), `numberFieldTextStyles` and `numberFieldUnitStyles`, exported from `NumberField.tsx`. `NumericField` is `NumberField` plus a commit-while-typing buffer. `InspectorValueInput` (game inspector rows, `size="small"` forces compact) and `inputs/NumberInput` (property and node-body rows, always compact) keep their own commit and gesture logic but draw their wrapper with those helpers. A new number control must use them too.
- Forbidden: `TextInput type="number"` or MUI `TextField type="number"` with hand-set `inputProps` min/max, `InputAdornment` for units, or per-file font and padding overrides on the input.

### Empty, loading and tabs

A panel or list with nothing to show draws `EmptyState`. A section that is
still fetching draws `LoadingSpinner`. A row of views over one surface is
`TabGroup` with a `TabPanel` per view.

```tsx
import { EmptyState, LoadingSpinner, TabGroup, TabPanel } from "../ui_primitives";

<EmptyState size="small" title="No layers yet" description="Add one below." />
<EmptyState size="small" variant="no-results" title="No matching nodes" />
{isLoading && <LoadingSpinner size="small" />}
<TabGroup tabs={tabs} value={view} onChange={setView} aria-label="Help sections" />
```

| Part | Rule |
|---|---|
| Size | `small` inside a list, menu panel or sidebar. `medium` fills a panel. `large` fills a page |
| Text | The title says what is missing in a few words ("No runs yet"). A description says what to do next and is optional. A custom title shows no default description |
| Icon | The variant picks a default. A passed `icon` takes the same size, so do not size it |
| Search | A search or filter with no matches uses `variant="no-results"` |
| Loading | Never bare "Loading…" text. A dropdown option may keep a disabled "Loading…" item |
| Tabs | `TabGroup`, not raw `Tabs` and `Tab`. A tab's `count` shows after its label. `value={false}` selects none, and `onReselect` reports a click on the selected tab, for a strip that also collapses its panel. `orientation="vertical"` makes a category rail. Closable tabs use `DockTabStrip`. Workspace document tabs are their own component |

### Drop zones

Every file drop target uses `DropZone` (`ui_primitives/DropZone.tsx`) or, for class-based surfaces, its style helpers. There is one drag-over look: `2px dashed primary` outline with the `action.selected` fill. The `reject` state uses the same outline in `error`; idle is `1px dashed divider`.

- **Inline target** (property editors, empty states): `<DropZone onFilesDrop={...}>` or, where the drop handler reads the DataTransfer itself (`useFileDrop`), pass `onDrop`.
- **Whole-panel target** (asset grid): `<DropZone overlay onFilesDrop={...}>`; children stay untouched and a translucent label layer covers them while over. `DropZoneOverlay` is the same layer for a hand-wired parent.
- **Class-based surfaces** (`.dropzone` / `.drag-over` CSS): spread `dropZoneSurfaceStyle(theme)` (or `dropZoneOverStyle`, `dropZoneRejectStyle`, `dropZoneOutline`) instead of writing outline and fill colours.
- Track drag state with `useDragOverState` (`hooks/handlers/useDragOverState.ts`); `useFileDrop` keeps the drop handling.
- Forbidden: hand-built `dashed` outlines with `grey[*]` fills, a `3px` dashed overlay, or a per-component `isDragOver` + `setTimeout` pair. Reorder-drag targets (timeline tracks, tabs, trees) are not drop zones and keep their insertion markers.

### Progress and generation status

A wait shows one of five marks, picked by what the user is waiting on. Never
draw a spinner, bar, sweep or rotating icon of your own.

```tsx
import {
  LoadingSpinner, MagicGenerationFill, ProgressBar, StatusPill, ThinkingIndicator
} from "../ui_primitives";

<LoadingSpinner size="small" text="Loading versions" />
<EditorButton startIcon={busy ? <LoadingSpinner inline size={16} color="inherit" /> : <SaveIcon />}>
  {busy ? "Saving…" : "Save"}
</EditorButton>
<ProgressBar value={percent} label={file.name} size="small" />
<ProgressBar value={0} progressVariant="indeterminate" showValue={false} size="small" accent={CLIP_COLOR} aria-label="Rendering clip" />
<ThinkingIndicator label="Editing video" announce />
{generating && <MagicGenerationFill borderRadius={BORDER_RADIUS.md} />}
<StatusPill tone="rendering" accent={CLIP_COLOR}>rendering clip</StatusPill>
```

| Waiting on | Mark |
|---|---|
| A fetch, a save or a step with no measure | `LoadingSpinner`. `small` in a list, row or sidebar, `medium` to fill a panel, `large` to fill a page |
| Work that reports progress, or a running job under its card | `ProgressBar`, determinate when a value exists and `progressVariant="indeterminate"` until then |
| A model composing text, a plan or an edit | `ThinkingIndicator` with a label |
| Media being generated | `MagicGenerationFill` over the media's frame, which needs `position: relative` |
| The state of a render or a run, after or during it | `StatusPill` on a thumbnail or card, `StatusIndicator` (dot and label) in a list row |

| Part | Rule |
|---|---|
| Inline spinner | A spinner that stands in for an icon passes `inline` and that icon's size: 14 beside caption text, in a chip or a step badge, 16 in a button. Inside a button or chip it passes `color="inherit"`. Never set `thickness` or restyle `.MuiCircularProgress-root` |
| Step in progress | A running step in a plan, todo or timeline shows an inline `LoadingSpinner`, not a rotating `Autorenew` icon |
| Bar size | `ProgressBar` is 6px on its own line and `size="small"` (4px) on a card edge or in a dense row. Never set its `height`, track colour or bar colour through `sx` |
| Bar colour | Primary by default. A surface's own colour (a clip, a node namespace) goes in `accent`. A stalled transfer passes `color="warning"`. One colour per bar, no gradients |
| Accessible name | A labelled `ProgressBar` takes its name from `label`. A bar with no visible label passes `aria-label`. A `ThinkingIndicator` that is the only sign of the wait passes `announce` |
| Text | Sentence case. The `text` of `LoadingSpinner` and the `label` of `ThinkingIndicator` carry no ellipsis, because the mark already moves: "Loading models". A busy label written as text, on a button or in a caption, ends with one "…" character, never three dots: "Saving…", "Generating…" |

### Model picker

Every model field opens one picker, `ModelMenuDialogBase`, from a
`ModelSelectButton`. A new model type supplies its data, title and store, not a
new picker. Preview it at `/preview/model-picker`.

| Part | Rule |
|---|---|
| Trigger | `ModelSelectButton`: an outlined field with the model name, its provider or file in `text.secondary`, and a chevron. The placeholder is sentence case: "Select model", "Select image model" |
| Surface | A menu surface (`menuPaperStyles`), 640 by 560px, full screen below `sm` |
| Sidebar | `ModelMenuNavItem` rows, 32px: All models, Favorites, Recent, then providers under a "Providers" `SectionHeader`. Each row has a 16px icon, a label and its model count. Disabled providers follow under "Disabled", in `text.disabled`. A provider without its API key ends in a warning icon. Below `sm` the same entries become a strip of filter `Chip`s |
| Model row | One line, 32px: the name in `TYPOGRAPHY.sans.label`, then the provider (or, for a file, its model) as `Caption`. Favorite and default pin show on hover, keyboard focus and touch. The execution state is a compact `Chip`: `info` for API, `success` for a ready local model, `warning` when files must download first |
| Unavailable | The row stays listed in `text.disabled` and its tooltip says what is missing |

### Links and breadcrumbs

A link navigates; a button acts. Text that navigates is `TextLink`
(`primary.main`, underline on hover, `external` adds the new-tab attributes).
An off-site URL with an arrow glyph is `ExternalLink`. A docs link next to a
heading is `DocsHelpLink` or the `docsTopic` prop of `PanelHeader` and
`PageHeader`. Never a raw `<a href>` and never `window.open` from a row's
`onClick`, because neither is keyboard reachable as a link. Rendered Markdown
(chat, notes) styles its anchors through the Markdown stylesheet instead.

A path through folders or nested graphs is `Breadcrumbs`: 13px, chevron
separators, the last item in `text.primary` and not clickable, earlier items
in `text.secondary`, collapsing to "…" past `maxItems`.

### Errors and banners

A message about the state of a surface is a banner. A failure always says
what failed and offers a way on.

| Situation | Use |
|---|---|
| A field value is wrong | The field's `errorMessage` or `error`, under the field. A control outside `TextInput`/`FormField` puts `FieldError` under it |
| A load or an operation failed inside a panel, dialog or page | `ErrorBanner` from `components/support/`: `AlertBanner severity="error"` with the Report control and an optional retry |
| The content of a surface could not load at all | `EmptyState variant="error"` in place of the content, with a retry action, plus the Report control |
| A user action failed and the surface is fine | `useAlertNotifier("error")` |
| The user's own script or input produced the error (a script test run, a bad expression) | `AlertBanner severity="error"`, without Report, because it is not a NodeTool fault |
| A run was cancelled, expired or will not work as set up | `AlertBanner severity="warning"`, `compact` in a dense panel |
| A count of failed items in a status bar, or a failed tile | `StatusIndicator status="error"` with the count as `label`, or `StatusPill tone="failed"` on the tile |
| A list row whose item failed | The row's status mark (`StatusIndicator`, a status tile) carries the failure. Its secondary line stays `text.secondary` |
| A warning or an explanation that stays on the surface | `AlertBanner` with `severity="warning"` or `"info"`, `compact` in a dense panel |
| A merge conflict in a document editor | `ConflictBanner` |
| A crash | The error boundary (`PanelErrorBoundary`), which already carries Report |

Banners sit at the top of the surface they describe, inset like the content,
with `BORDER_RADIUS.lg`. Text is one or two sentences in sentence case: what
happened, then what to do. Never show a failure as `Text` or `Caption` with
`color="error"`, and never as a bare stack trace.

---

## 15. Migration Checklist

When editing any UI file, scan for these violations and fix them in the same PR. For element-level deviations (a hand-built element where a primitive exists), run `npm run audit:ui -- --rule <id>` with the ids from [Element standards](#element-standards).

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
| `boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"` | `SHADOW(theme).lg` |
| Raw `#hex` / `rgb()` color in sx | `theme.vars.palette.*` token |
| `<Typography>` | `<Text>`, `<Label>`, or `<Caption>` |
| `title=` on a button, `delay={...}` on a tooltip, "(Ctrl+Z)" in tooltip text | `tooltip` / `Tooltip` with `shortcut` and the default delay |
| `display: "flex"` in sx | `<FlexRow>` or `<FlexColumn>` |
| `overflow: "auto"` container | `<ScrollArea>` |
| `textOverflow: "ellipsis"` | `<TruncatedText>` |
| Hand-built panel title row | `<PanelHeader>` |

---

## 16. Adding New Tokens

1. **Spacing**: Only add a new `SPACING.*` step if the existing nine steps genuinely cannot express the design intent. Justify in the PR. Update `spacing.ts`.
2. **Typography**: Do not add a ninth type style. Any new text hierarchy must collapse onto one of the eight existing combinations.
3. **Color**: Add as a `c_*` key in **both** `paletteDark.ts` and `paletteLight.ts`. Document its semantic role in a comment.
4. **Border radius**: Add a new `BORDER_RADIUS.*` entry in `tokens.ts` and a corresponding `--rounded-*` CSS var in `ThemeNodetool.tsx` `MuiCssBaseline`.
5. **Motion**: If a new timing is needed, add to `MOTION` in `tokens.ts` as a named constant — never use the value inline. Transitions use the `fast`/`normal`/`slow` tiers or a property shorthand; infinite `@keyframes` loops use `MOTION.spin` (1s linear) / `MOTION.pulse` (2s ease-in-out) rather than a sub-second tier. New animated components must also include a `reducedMotion()` override.
6. **Z-index**: Add to `Z_INDEX` in `tokens.ts` or to `theme.zIndex` in `ThemeNodetool.tsx`. Never use a raw integer.
7. **Elevation**: Reuse a `SHADOW` level. Add one only when a surface needs a depth the scale cannot express, and give it a role name, not a number.

---

## 17. Design Decisions and Tradeoffs

Documented rationale for choices that differ from common defaults.

### Body text at 15px (not 16px)

The WCAG accessibility guidance and many style guides recommend 16px as the minimum body text size. NodeTool uses 15px (`--fontSizeNormal`) because the application is a **dense developer tool** (workflow editor, inspector, code runners) where screen real estate is precious and users are primarily on desktop. VS Code uses 13px, GitHub uses 14px, Linear uses 14px. At 15px on a 1x display, readability is acceptable; the `font-size` root setting in the user's browser can still scale it up, and WCAG 1.4.4 (Resize Text) is met as long as text reflows at 200% zoom without loss of content. If the product ever targets general-audience screens or mobile as a primary surface, revisit this.

### 4px base grid (not 8px)

Material Design and Apple HIG both recommend an 8px grid. NodeTool uses a 4px grid because it needs intermediate densities (2px micro-gaps inside node controls, 6px compact padding) that an 8px grid cannot express without off-grid values. The 8px steps still exist (`SPACING.md` = 8px, `SPACING.xl` = 16px) as the default spacing rhythm; the finer steps are used only in the editor's dense control surfaces.

### Flat token tier (no primitive → semantic → component layering)

The W3C Design Tokens Community Group specification (DTCG, stable as of 2025.10) recommends a three-tier model: primitive tokens → semantic/alias tokens → component tokens, expressed in a `.tokens.json` file. NodeTool uses a flat semantic tier only — `SPACING.md`, `BORDER_RADIUS.sm`, `c_node_bg` — because:
- The codebase is a single product, not a multi-brand system. The main benefit of the primitive tier (reusing raw values across brands) does not apply.
- TypeScript constant objects provide type safety and tree-shaking that a JSON token file does not.
- The DTCG format is valuable if you want Figma/Storybook/other tools to consume the tokens directly. When that need arises, generate the `.tokens.json` from the TypeScript source — do not author two separate files.

### Motion: duration and easing bundled, not separated

Some systems separate `duration.fast = 120ms` from `easing.standard = ease` to allow independent variation. NodeTool bundles them (`MOTION.fast = "120ms ease"`) because: (a) all transitions use the same easing curve (`ease`), so separation adds API surface with no benefit; (b) property shorthands (`MOTION.border = "border-color 200ms ease"`) already encode all three values. If you ever need a different easing (e.g. a spring curve for a specific animation), use `MOTION.slow` as the duration tier and add a named constant for the specific animation.

---

## Related Documents

- **[UI Primitives Strategy](../web/src/components/ui_primitives/STRATEGY.md)** — Primitives-first policy, decision tree, migration rules, full 90+ component catalog
- **[UI Primitives README](../web/src/components/ui_primitives/README.md)** — Component API reference
- **[UI Primitives EXAMPLES](../web/src/components/ui_primitives/EXAMPLES.md)** — Practical code examples for every primitive
- **[Development Standards §5](DEVELOPMENT_STANDARDS.md#5-mui-v7--emotion--ui-primitives)** — Enforceable MUI/primitives/token rules
- **[ThemeNodetool.tsx](../web/src/components/themes/ThemeNodetool.tsx)** — MUI theme, CSS variable definitions, component overrides
- **[tokens.ts](../web/src/components/ui_primitives/tokens.ts)** — TYPOGRAPHY, MOTION, Z_INDEX, BORDER_RADIUS, SHADOW, reducedMotion, scrollbarStyles
- **[spacing.ts](../web/src/components/ui_primitives/spacing.ts)** — SPACING, GAP, PADDING, MARGIN, snapSpacing
- **[DTCG Specification](https://www.designtokens.org/tr/2025.10/format/)** — W3C Design Tokens Format v2025.10 (stable). Reference if cross-tool token export is ever needed.
