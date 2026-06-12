# Components Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Components**

## UI Primitives — Mandatory

**All UI must be built from primitives.** The `ui_primitives/` directory contains 90+ reusable, theme-driven components. Read the **[Primitives Strategy](ui_primitives/STRATEGY.md)** before writing any frontend code.

### The Rule

**Never import raw MUI components in component files.** The following MUI imports are **banned** outside of `ui_primitives/` and `editor_ui/`:

```
BANNED: import { Typography, Button, IconButton, Tooltip, CircularProgress,
  Chip, Dialog, Alert, Divider, Paper, Skeleton, Tabs, Tab, Drawer,
  Breadcrumbs, Select, Switch, TextField, LinearProgress } from "@mui/material";
```

Use the corresponding primitive instead:

| Instead of (raw MUI) | Use (primitive) |
|---|---|
| `<Typography>` | `Text`, `Label`, `Caption`, `TruncatedText` |
| `<Button>` | `EditorButton`, or a semantic button (`CopyButton`, `DeleteButton`, etc.) |
| `<IconButton>` + `<Tooltip>` | `ToolbarIconButton`, `StateIconButton`, or action buttons |
| `<CircularProgress>` | `LoadingSpinner` |
| `<Tooltip>` | `Tooltip` primitive |
| `<Chip>` | `Chip` primitive |
| `<Dialog>` | `Dialog` primitive |
| `<Alert>` | `AlertBanner` |
| `<Divider>` | `Divider` primitive |
| `<Paper>` | `Card`, `Surface`, or `Panel` |
| `<Skeleton>` | `Skeleton` primitive |
| `<Tabs>`/`<Tab>` | `TabGroup` / `TabPanel` |
| `<Drawer>` | `DrawerPanel` |
| `<Breadcrumbs>` | `Breadcrumbs` primitive |
| `<TextField>` | `NodeTextField`, `TextInput`, or `SearchInput` |
| `<Select>` | `NodeSelect`, `SelectField` |
| `<Switch>` | `NodeSwitch`, `LabeledSwitch` |
| `<LinearProgress>` | `ProgressBar` |
| `display: "flex"` in sx | `FlexRow` or `FlexColumn` |
| `textOverflow: "ellipsis"` | `TruncatedText` |
| `overflow: "auto"` scroll container | `ScrollArea` or `Container` |
| Empty/no-data message | `EmptyState` |
| Label + input + helper text | `FormField` |
| Section title + action button | `SectionHeader` |
| Expand/collapse pattern | `CollapsibleSection` |

### Importing Primitives

```tsx
import { FlexColumn, Text, LoadingSpinner, Card } from "../ui_primitives";
```

All primitives are re-exported from `ui_primitives/index.ts`. Use relative imports from the component's location.

### Opportunistic Migration

When editing any component file for any reason, **also migrate** raw MUI usage in that file to primitives. This is how we incrementally eliminate the ~600 raw MUI usages still in the codebase.

### Creating New Primitives

If no existing primitive fits your use case:
1. Create the component in `ui_primitives/`
2. Use `useTheme()` for all styling — no hardcoded values
3. Support the `sx` prop for overrides
4. Define a TypeScript props interface
5. Export from `ui_primitives/index.ts`
6. Add tests in `ui_primitives/__tests__/`
7. Update the [Strategy doc](ui_primitives/STRATEGY.md)

## General Rules

- Use functional components only. No class components.
- Define a TypeScript interface for all component props.
- Keep components focused on a single responsibility.
- Use composition over inheritance and deep prop drilling.
- Use `React.memo` only when the component is pure, receives stable props, renders often, and is expensive to render.
- Don't create new inline objects/functions in JSX when passing to memoized children.
- Co-locate tests in `__tests__/` subdirectories next to source files.

## Node editor pitfalls

From shipped fixes in `node_editor/`, `node/`, and the Inspector:

- **Per-type handle/edge colors are generated CSS scoped to the canvas wrapper,
  not inherited globally.** When you move or rename the component hosting the
  ReactFlow canvas, carry the `css={generateCSS}` injection onto the new wrapper
  — drop it and every handle falls back to grey.
- **A property whose value is driven by a connected input edge must be rendered
  inert and dimmed — never editable.** Plumb `isConnected` into `PropertyInput`
  and use the `inert` attribute (not just `disabled`/`pointer-events`) so the
  field also leaves the tab order; editing a connection-driven value is a no-op
  that confuses users.
- **Don't write `x !== null` after a truthiness guard (`x && …`).** The truthy
  check already excludes `null`/`undefined`; the extra comparison is dead code
  and gets flagged by CodeQL ("comparison between inconvertible types"). This bit
  several node-status guards in `BaseNode`/`Dynamic*Node`.

## Styling

See **[docs/DESIGN.md](../../../docs/DESIGN.md)** for the full design token reference and migration checklist. Summary of the mandatory rules:

- Use `sx` prop on primitives for one-off style overrides.
- Use `styled()` only inside `ui_primitives/` for defining new primitives — not in regular component files.
- Use theme values (`theme.spacing()`, `theme.vars.palette`, `theme.fontSizeSmall`, etc.) — never hardcode colors, fonts, or spacing.
- No inline `display: "flex"` — use `FlexRow` / `FlexColumn` primitives.
- No hardcoded hex colors (`#fff`, `#000`, `rgb(...)`) — use theme palette values.
- **Spacing**: use `SPACING.*` / `GAP.*` / `PADDING.*` — forbidden: `5px`, `10px`, `13px`, `20px`, or any off-grid pixel value.
- **Typography**: use `<Text>` / `<Label>` / `<Caption>` or `TYPOGRAPHY.*` — forbidden: raw `fontSize` px/rem literals, weights `700 / "bold" / 300`.
- **Border radius**: use `BORDER_RADIUS.sm / lg / pill / circle` — forbidden: magic numbers (`4`, `10`, `18`), raw `"var(--rounded-*)"` strings.
- **Transitions**: use `MOTION.all / border / background / transform / opacity / shadow` — forbidden: raw timing strings (`"all 200ms ease"`).
- **Z-index**: use `Z_INDEX.*` — forbidden: raw integers (`9999`, `1000`).

## Testing

```bash
cd web
npm test                          # Run all tests
npm run test:watch                # Watch mode
npm test -- --testPathPattern=components  # Components only
```

- Use React Testing Library queries (`getByRole`, `getByLabelText`, `getByText`).
- Use `userEvent` for interactions.
- Test user-facing behavior, not implementation details.
- Mock external dependencies (stores, API calls).
