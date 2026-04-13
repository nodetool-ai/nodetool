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
`Dialog` | `DialogActionButtons` | `ColorSwatch` | `ResponsiveImage` | `ShortcutHint` | `KeyboardShortcutCard` | `ThemeToggleButton` | `Chip` | `Divider` | `SkipLinks` | `ZoomControls`

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

### How to Create a New Primitive

If no existing primitive fits:

1. Create the component in `web/src/components/ui_primitives/`
2. Use `useTheme()` for all styling — no hardcoded values
3. Support `sx` prop for overrides
4. Add TypeScript interface for props
5. Export from `index.ts`
6. Add tests in `__tests__/`
7. Update this strategy doc's category listing

## Spacing System

Always use the spacing constants instead of raw numbers:

```tsx
import { SPACING, GAP, PADDING } from "../ui_primitives";

// Use named constants for clarity
<FlexColumn gap={GAP.normal} padding={PADDING.comfortable}>

// Or use the SPACING scale directly
<FlexRow gap={SPACING.md}>  // 8px
```

| Token | Value | Pixels |
|---|---|---|
| `SPACING.xxs` | 0.5 | 2px |
| `SPACING.xs` | 1 | 4px |
| `SPACING.sm` | 1.5 | 6px |
| `SPACING.md` | 2 | 8px |
| `SPACING.ml` | 2.5 | 10px |
| `SPACING.lg` | 3 | 12px |
| `SPACING.xl` | 4 | 16px |
| `SPACING.xxl` | 5 | 20px |
| `SPACING.huge` | 6 | 24px |

## Related Documents

- **[Primitives README](./README.md)** — Full API reference with usage examples
- **[Implementation Guide](./IMPLEMENTATION.md)** — Real-world refactoring examples
- **[Examples](./EXAMPLES.md)** — Practical code examples for each primitive
- **[Summary](./SUMMARY.md)** — Overview and adoption statistics
- **[Components AGENTS.md](../AGENTS.md)** — Component architecture rules
- **[Root AGENTS.md](../../../../AGENTS.md)** — Project-wide coding standards
