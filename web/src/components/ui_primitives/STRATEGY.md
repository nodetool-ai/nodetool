# UI Primitives Strategy

**Navigation**: [Root AGENTS.md](../../../../AGENTS.md) | [Web](../../AGENTS.md) | [Components](../AGENTS.md) | [Primitives README](./README.md)

## Core Principle

**Primitives first, raw MUI never.** Every UI element in the application should be built from UI primitives. Raw MUI component imports (`<Typography>`, `<Button>`, `<Tooltip>`, etc.) are forbidden outside of `ui_primitives/` and `editor_ui/`. If a primitive doesn't exist for your use case, create one — don't reach for raw MUI.

## Why This Matters

Raw MUI usage creates:
- **Inconsistent styling** — each developer styles `<Typography>` differently
- **Duplicated patterns** — the same flex/gap/padding combo written 300+ times
- **Maintenance burden** — design changes require touching hundreds of files
- **Onboarding friction** — new contributors must learn implicit conventions instead of explicit components

## Current State (Audit Results)

### High-Priority Migration Targets

| Raw MUI Component | Files Using It | Primitive Replacement |
|---|---|---|
| `display: flex` inline | **314 files** | `FlexRow`, `FlexColumn`, `Stack` |
| `<Typography>` | **201 files** | `Text`, `Label`, `Caption` |
| `<Tooltip>` | **146 files** | `Tooltip` primitive |
| `<Button>` | **103 files** | `EditorButton`, action buttons (`CopyButton`, `DeleteButton`, etc.) |
| `<IconButton>` | **72 files** | `ToolbarIconButton`, `StateIconButton`, action buttons |
| `<CircularProgress>` | **55 files** | `LoadingSpinner` |
| Hardcoded hex colors | **45 files** | Theme values (`theme.vars.palette.*`) |
| `<Dialog>` | **44 files** | `Dialog` primitive |
| `<TextField>` | **40 files** | `NodeTextField`, `TextInput`, `SearchInput` |
| `<Select>` | **37 files** | `NodeSelect`, `SelectField` |
| `<Chip>` | **37 files** | `Chip` primitive |
| `<Divider>` | **30 files** | `Divider` primitive |
| Hardcoded px values | **27 files** | `theme.spacing()`, `SPACING` constants |
| `<Alert>` | **14 files** | `AlertBanner` |
| `<Paper>` | **12 files** | `Card`, `Surface`, `Panel` |
| `<Tabs>`/`<Tab>` | **10 files** | `TabGroup` / `TabPanel` |

### Underutilized Primitives

These primitives exist but are barely adopted:

| Primitive | Current Uses | Potential Uses | Gap |
|---|---|---|---|
| `SectionHeader` | 1 | 9+ | Header + action patterns done manually |
| `FormField` | 1 | 14+ | Label + input + helper text done manually |
| `CollapsibleSection` | 4 | 59+ | Expand/collapse patterns done manually |
| `EmptyState` | 8 | 74+ | "No items" messages done manually |
| `TruncatedText` | low | 157+ files with ellipsis | Text overflow done manually |
| `ScrollArea` | low | many | `overflow: auto` done manually |

## Primitive Categories

### Layout (replace raw flex/grid patterns)
`FlexColumn` | `FlexRow` | `Stack` | `Container` | `ScrollArea`

### Surfaces (replace raw Box/Paper/div)
`Card` | `Panel` | `Surface` | `Overlay` | `DrawerPanel`

### Typography (replace raw Typography)
`Text` | `Label` | `Caption` | `TruncatedText` | `TextLink` | `ExternalLink`

### Inputs (replace raw TextField/Select/Switch)
`NodeTextField` | `TextInput` | `NodeNumberInput` | `NodeSelect` | `SelectField` | `NodeSwitch` | `LabeledSwitch` | `NodeSlider` | `Checkbox` | `Autocomplete` | `AutocompleteTagInput` | `TagInput` | `SearchInput`

### Buttons (replace raw Button/IconButton)
`EditorButton` | `ToolbarIconButton` | `StateIconButton` | `CircularActionButton` | `NavButton` | `CreateFab` | `PlaybackButton` | `RunWorkflowButton` | `ExpandCollapseButton` | `RefreshButton` | `ViewModeToggle` | `LabeledToggle` | `ConfirmButton`

### Semantic Action Buttons (replace custom icon+tooltip combos)
`CopyButton` | `CloseButton` | `DeleteButton` | `DownloadButton` | `UploadButton` | `EditButton` | `SettingsButton` | `FavoriteButton` | `HelpButton` | `UndoRedoButtons`

### Feedback & Status (replace raw CircularProgress/Alert)
`LoadingSpinner` | `ProgressBar` | `Skeleton` | `StatusIndicator` | `EmptyState` | `AlertBanner` | `WarningBanner` | `Toast` | `NotificationBadge`

### Composite (replace manual layout combos)
`FormField` | `SectionHeader` | `CollapsibleSection` | `TabGroup` / `TabPanel` | `ActionButtonGroup` | `ButtonGroup` | `ToggleGroup` | `SelectionControls` | `ListGroup` / `ListItemRow` | `DataTable`

### Menus & Navigation
`EditorMenu` | `EditorMenuItem` | `MenuItemPrimitive` | `ContextMenu` | `Breadcrumbs` | `InfoTooltip` | `Tooltip` | `Popover`

### Misc
`Dialog` | `PositionedDialog` | `DialogActionButtons` | `ColorSwatch` | `ResponsiveImage` | `ShortcutHint` | `KeyboardShortcutCard` | `ThemeToggleButton` | `Chip` | `Divider` | `SkipLinks` | `ZoomControls` | `HoverActionGroup` | `SelectableListItem` | `DropZoneOverlay` | `MetadataListRow`

## Decision Tree: Which Primitive to Use

```
Need a flex container?
├── Vertical → FlexColumn
├── Horizontal → FlexRow
└── Vertical with dividers → Stack

Need to show text?
├── Heading/body text → Text (with size prop)
├── Form label → Label
├── Secondary/helper text → Caption
├── Long text that may overflow → TruncatedText
└── Clickable link → TextLink / ExternalLink

Need a button?
├── Standard button → EditorButton
├── Icon-only in toolbar → ToolbarIconButton
├── Specific action (copy/delete/close/etc.) → Semantic action button
├── Toggle on/off → LabeledToggle / ViewModeToggle
├── Floating action → CreateFab / CircularActionButton
└── Confirm with danger → ConfirmButton

Need an input?
├── Text → NodeTextField (in nodes) / TextInput (elsewhere)
├── Number → NodeNumberInput
├── Boolean → NodeSwitch / LabeledSwitch / Checkbox
├── Select from options → NodeSelect / SelectField
├── Slider → NodeSlider
├── Search → SearchInput
├── Tags → TagInput / AutocompleteTagInput
└── Label + input + help → FormField (wraps any input)

Need a container/surface?
├── Content card → Card
├── Panel with header/footer → Panel
├── Generic surface → Surface
├── Modal → Dialog
├── Side panel → DrawerPanel
├── Backdrop → Overlay
└── Scrollable content → ScrollArea / Container

Need feedback?
├── Loading → LoadingSpinner
├── Progress → ProgressBar
├── Placeholder → Skeleton
├── Nothing to show → EmptyState
├── Warning/error → AlertBanner / WarningBanner
├── Temporary message → Toast
└── Status dot/badge → StatusIndicator / NotificationBadge

Need a menu/nav?
├── Context menu → ContextMenu / EditorMenu
├── Menu item → MenuItemPrimitive / EditorMenuItem
├── Breadcrumbs → Breadcrumbs
├── Tooltip → Tooltip / InfoTooltip
└── Popover → Popover
```

## Migration Rules

### What to Do When Editing a File

When you touch a file for any reason:

1. **Check for raw MUI imports** — if you see `import { Typography, Button, ... } from "@mui/material"`, replace the usage with primitives
2. **Check for inline flex patterns** — replace `display: "flex"` / `flexDirection: "column"` with `FlexColumn`/`FlexRow`
3. **Check for hardcoded colors** — replace hex codes / rgb values with `theme.vars.palette.*`
4. **Check for manual loading states** — replace raw `<CircularProgress>` with `<LoadingSpinner>`
5. **Check for manual empty states** — replace "no items" text with `<EmptyState>`

### What NOT to Do

- **Don't create new `styled()` components** — use primitives with `sx` prop instead
- **Don't import raw MUI components** outside `ui_primitives/` or `editor_ui/`
- **Don't add `display: "flex"` to sx props** — use FlexRow/FlexColumn
- **Don't manually style Typography** — use Text/Label/Caption
- **Don't wrap IconButton in Tooltip manually** — use ToolbarIconButton
- **Don't create one-off loading spinners** — use LoadingSpinner
- **Don't write `textOverflow: "ellipsis"` CSS** — use TruncatedText
- **Don't write font sizes/weights outside the 4-combo table** — use `Text`/`Label`/`Caption` or `TYPOGRAPHY.*` (see Typography System)
- **Don't write off-grid spacing** (`0.25`, `0.75`, `2.5`, `5px`, `10px`, `13px`…) — snap to a `SPACING` step (see Spacing System)

### How to Create a New Primitive

If no existing primitive fits:

1. Create the component in `web/src/components/ui_primitives/`
2. Use `useTheme()` for all styling — no hardcoded values
3. Support `sx` prop for overrides
4. Add TypeScript interface for props
5. Export from `index.ts`
6. Add tests in `__tests__/`
7. Update this strategy doc's category listing

## Typography System (STRICT)

**RULE: Each font class exposes EXACTLY FOUR size+weight combinations. No fifth
combination may appear anywhere in the app.** This is enforced through the
design tokens and the typography primitives — never write a raw `fontSize` /
`fontWeight` that lands outside the table below.

**Every font size is driven by a theme CSS variable.** The four sizes are
defined ONCE, in `ThemeNodetool` (`fontSizeBig/Normal/Small/Smaller`), and
referenced everywhere as `var(--fontSize*)`. Never hardcode a px/rem font size
in a component, sx block, or CSS file — change the size in the theme and it
propagates.

- **Allowed sizes** — `var(--fontSizeBig)` 18 · `var(--fontSizeNormal)` 15 ·
  `var(--fontSizeSmall)` 13 · `var(--fontSizeSmaller)` 11
- **Allowed weights** — `400` (normal) · `500` (medium) · `600` (semibold).
  `200`, `300`, `700`, `800`, `bold`, `lighter` are forbidden.

| Class | Role | Var (px) | Weight | Use |
|---|---|---|---|---|
| **Sans** (`Inter`) | `title` | `--fontSizeBig` (18) | 600 | headings (h1–h3), dialog/section titles |
| | `body` | `--fontSizeNormal` (15) | 400 | default body text, paragraphs |
| | `label` | `--fontSizeSmall` (13) | 500 | form labels, buttons, controls, h4–h6, secondary text |
| | `caption` | `--fontSizeSmaller` (11) | 400 | hints, metadata, badges |
| **Mono** (`JetBrains Mono`) | `code` | `--fontSizeSmall` (13) | 400 | code, values, editor text |
| | `strong` | `--fontSizeSmall` (13) | 600 | emphasized mono |
| | `label` | `--fontSizeSmall` (13) | 500 | mono keys / labels |
| | `caption` | `--fontSizeSmaller` (11) | 400 | small mono, mono tooltips |

```tsx
import { Text, Caption, Label } from "../ui_primitives";
import { TYPOGRAPHY } from "../ui_primitives";

// Prefer the typography primitives — they default to the correct combo:
<Text>Body copy</Text>                 // 15px / 400
<Text size="big">Title</Text>          // 18px / 600
<Label>Channel name</Label>            // 13px / 500
<Caption>Updated 2h ago</Caption>      // 11px / 400

// In an sx/css block, spread a sanctioned style instead of raw values:
<Box sx={{ ...TYPOGRAPHY.sans.label }}>Filters</Box>
<Box sx={{ ...TYPOGRAPHY.mono.code }}>{value}</Box>
```

**Forbidden:**
- Any hardcoded px/rem font size (`"0.85rem"`, `"14px"`, `"20px"`, even `"13px"`)
  — reference `var(--fontSize*)` instead.
- `fontWeight: 700`, `fontWeight: "bold"`, `fontWeight: 300` — only `400/500/600`.
- Mixing a size with a weight that isn't its sanctioned pair (e.g. `15px / 600`).

**Exempt:** icon glyph sizing via relative `em` units (e.g.
`<DeleteIcon sx={{ fontSize: "1.2em" }} />`) is icon scaling, not text
typography, and is outside this rule. Use `em` only for icons.

Heading hierarchy is conveyed by **margin, letter-spacing, color, and case** —
never by introducing extra font sizes. `h1`–`h3` collapse onto `title`; `h4`–`h6`
collapse onto `label`.

## Spacing System (STRICT)

**RULE: All spacing — padding, margin, and gap, on BOTH axes — must use one of
the canonical steps below. Vertical spacing uses the same scale and gets the
same care as horizontal spacing. There are no other allowed values; snap every
outlier to the nearest step.** Off-grid values like `0.25`, `0.75`, `1.25`,
`2.5`, `5` (theme units) or `5px`, `10px`, `13px`, `20px` are forbidden — group
them into a canonical category.

Always use the spacing constants instead of raw numbers:

```tsx
import { SPACING, GAP, PADDING } from "../ui_primitives";

// Use named constants for clarity
<FlexColumn gap={GAP.normal} padding={PADDING.comfortable}>

// Or use the SPACING scale directly
<FlexRow gap={SPACING.md}>  // 8px
```

| Token | Value | Pixels | Use |
|---|---|---|---|
| `SPACING.none` | 0 | 0px | flush |
| `SPACING.micro` | 0.5 | 2px | icon/label gaps in dense controls |
| `SPACING.xs` | 1 | 4px | tight stacking |
| `SPACING.sm` | 1.5 | 6px | compact control padding |
| `SPACING.md` | 2 | 8px | default gap / padding |
| `SPACING.lg` | 3 | 12px | grouped sections |
| `SPACING.xl` | 4 | 16px | panel padding |
| `SPACING.xxl` | 6 | 24px | large section separation |
| `SPACING.xxxl` | 8 | 32px | page-level rhythm |

Legacy alias keys (`xxs`, `ml`, `huge`) still resolve, but they now snap onto a
canonical step. Use `snapSpacing(units)` to migrate a literal you can't
hand-classify. The canonical px grid for raw CSS is `0 / 2 / 4 / 6 / 8 / 12 /
16 / 24 / 32`.

> **Not spacing:** ReactFlow `fitView({ padding })`, viewport ratios, opacity,
> scale, and flex values are not spacing — leave them alone.

## Design Tokens

Beyond spacing, use these constants from `tokens.ts` for consistent values across all style files.

### MOTION — transition timing

```ts
import { MOTION } from "../ui_primitives";

// Single property
transition: MOTION.all          // "all 200ms ease"
transition: MOTION.border       // "border-color 200ms ease"
transition: MOTION.background   // "background-color 150ms ease"
transition: MOTION.transform    // "transform 120ms ease"
transition: MOTION.opacity      // "opacity 150ms ease"
transition: MOTION.shadow       // "box-shadow 200ms ease"

// Compose multiple
transition: `${MOTION.border}, ${MOTION.shadow}`
```

| Token | Value | Use |
|---|---|---|
| `MOTION.fast` | `120ms ease` | Hover micro-interactions |
| `MOTION.normal` | `200ms ease` | Standard UI transitions |
| `MOTION.slow` | `350ms ease` | Panel/drawer animations |

### Z_INDEX — stacking layers

```ts
import { Z_INDEX } from "../ui_primitives";

zIndex: Z_INDEX.raised    // 1 — slightly elevated in flow
zIndex: Z_INDEX.dropdown  // 10 — menus, popovers
zIndex: Z_INDEX.sticky    // 20 — sticky headers
zIndex: Z_INDEX.overlay   // 100 — backdrops
zIndex: Z_INDEX.modal     // 200 — dialogs
zIndex: Z_INDEX.tooltip   // 300 — tooltips
zIndex: Z_INDEX.toast     // 400 — toasts/notifications
```

### BORDER_RADIUS — consistent radii

```ts
import { BORDER_RADIUS } from "../ui_primitives";

borderRadius: BORDER_RADIUS.sm     // "var(--rounded-sm)"
borderRadius: BORDER_RADIUS.lg     // "var(--rounded-lg)"
borderRadius: BORDER_RADIUS.pill   // "999px" — tags, chips, compact buttons
borderRadius: BORDER_RADIUS.circle // "var(--rounded-circle)"
```

Use `BORDER_RADIUS` instead of raw `"var(--rounded-*)"` strings or magic numbers like `999`, `10`, `4`.

### scrollbarStyles — standard themed scrollbar

In Emotion `css()` blocks, spread `scrollbarStyles(theme)` wherever you need the app's standard scrollbar appearance (uses the `c_scroll_thumb`/`c_scroll_bg`/`c_scroll_hover` palette tokens):

```ts
import { scrollbarStyles } from "../ui_primitives/tokens";

css({
  overflowY: "auto",
  ...scrollbarStyles(theme),
})
```

Only use `scrollbarStyles` for the standard scroll appearance. Components with intentionally different scrollbar colors (e.g. chat thread) keep their own styles.

## Related Documents

- **[Primitives README](./README.md)** — Full API reference with usage examples
- **[Implementation Guide](./IMPLEMENTATION.md)** — Real-world refactoring examples
- **[Examples](./EXAMPLES.md)** — Practical code examples for each primitive
- **[Summary](./SUMMARY.md)** — Overview and adoption statistics
- **[Components AGENTS.md](../AGENTS.md)** — Component architecture rules
- **[Root AGENTS.md](../../../../AGENTS.md)** — Project-wide coding standards
