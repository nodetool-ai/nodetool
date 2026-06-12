# Design System

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) | [UI Primitives Strategy](../web/src/components/ui_primitives/STRATEGY.md)

This is the single reference for NodeTool's design token systems. All frontend work must follow these rules. When touching any UI file, check each section and fix violations in the same PR.

---

## When This Applies

Apply these rules whenever you write or edit:
- Any `.tsx` / `.css` / Emotion `styled()` / `sx` prop in `web/src/` or `electron/src/`
- Any component that sets `borderRadius`, `transition`, `fontSize`, `fontWeight`, `padding`, `margin`, `gap`, or `zIndex`
- Any inline style, `sx` block, or `css()` call

If you're reading these rules because a token name appeared in a diff or review, scroll to the relevant section below.

---

## 1. Spacing — 4px grid (`SPACING`)

**Rule: Every `padding`, `margin`, and `gap` value — on both axes — must be one of the canonical steps. Off-grid values are forbidden.**

```tsx
import { SPACING, GAP, PADDING } from "../ui_primitives";

// Named constants (preferred)
<FlexColumn gap={GAP.normal} padding={PADDING.comfortable}>

// Or direct scale
<FlexRow gap={SPACING.md}>  // 8px
```

| Token | Theme units | Pixels | Use |
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

**Forbidden:** `5px`, `7px`, `10px`, `13px`, `20px`, theme units `0.25`, `0.75`, `1.25`, `2.5`, `5`. Snap to the nearest step.

**Not spacing:** ReactFlow `fitView({ padding })`, viewport ratios, opacity, scale, and flex values — leave these alone.

---

## 2. Typography — 4-size scale (`TYPOGRAPHY`)

**Rule: Only four size+weight combinations exist. Never write a raw `fontSize` or `fontWeight` outside the sanctioned table.**

```tsx
import { Text, Label, Caption } from "../ui_primitives";
import { TYPOGRAPHY } from "../ui_primitives";

// Prefer primitives — they default to the correct combo:
<Text>Body copy</Text>               // 15px / 400
<Text size="big">Title</Text>        // 18px / 600
<Label>Channel name</Label>          // 13px / 500
<Caption>Updated 2h ago</Caption>    // 11px / 400

// In sx blocks, spread a sanctioned style:
<Box sx={{ ...TYPOGRAPHY.sans.label }}>Filters</Box>
<Box sx={{ ...TYPOGRAPHY.mono.code }}>{value}</Box>
```

| Class | Role | CSS var (px) | Weight | Primitive |
|---|---|---|---|---|
| Sans | `title` | `--fontSizeBig` (18) | 600 | `<Text size="big">` |
| Sans | `body` | `--fontSizeNormal` (15) | 400 | `<Text>` |
| Sans | `label` | `--fontSizeSmall` (13) | 500 | `<Label>` |
| Sans | `caption` | `--fontSizeSmaller` (11) | 400 | `<Caption>` |
| Mono | `code` | `--fontSizeSmall` (13) | 400 | `<Text mono>` |
| Mono | `strong` | `--fontSizeSmall` (13) | 600 | — |
| Mono | `label` | `--fontSizeSmall` (13) | 500 | — |
| Mono | `caption` | `--fontSizeSmaller` (11) | 400 | — |

**Forbidden:**
- Any hardcoded px/rem font size (`"14px"`, `"0.85rem"`, even `"13px"`) — reference `var(--fontSize*)` instead
- `fontWeight: 700`, `fontWeight: "bold"`, `fontWeight: 300` — only `400`, `500`, `600`
- Mixing a size with a weight that isn't its sanctioned pair (e.g. 15px / 600)

**Exempt:** icon glyph sizing via relative `em` units (e.g. `<DeleteIcon sx={{ fontSize: "1.2em" }} />`) is icon scaling, not typography — use `em` only for icons.

---

## 3. Border Radius (`BORDER_RADIUS`)

**Rule: Never use magic numbers (`4`, `8`, `10`, `999`, `18`) or raw CSS variable strings (`"var(--rounded-sm)"`) for border radius. Always use the constant.**

```tsx
import { BORDER_RADIUS } from "../ui_primitives";

borderRadius: BORDER_RADIUS.sm      // "var(--rounded-sm)"  — inputs, cards
borderRadius: BORDER_RADIUS.lg      // "var(--rounded-lg)"  — panels, modals
borderRadius: BORDER_RADIUS.pill    // "999px"              — tags, chips
borderRadius: BORDER_RADIUS.circle  // "var(--rounded-circle)" — avatars, icons
```

**Forbidden:** `1px`, `3px`, `4px`, `7px`, `10px`, `18px` hardcoded as border radii; raw `"var(--rounded-*)"` string literals; `"50%"` for circles (use `BORDER_RADIUS.circle`).

---

## 4. Motion / Transitions (`MOTION`)

**Rule: Never write raw transition strings like `"all 200ms ease"` or `"background-color 150ms"`. Always use a `MOTION` token.**

```tsx
import { MOTION } from "../ui_primitives";

// Single property
transition: MOTION.all          // "all 200ms ease"
transition: MOTION.border       // "border-color 200ms ease"
transition: MOTION.background   // "background-color 150ms ease"
transition: MOTION.transform    // "transform 120ms ease"
transition: MOTION.opacity      // "opacity 150ms ease"
transition: MOTION.shadow       // "box-shadow 200ms ease"

// Compose
transition: `${MOTION.border}, ${MOTION.shadow}`
```

| Token | Value | Use |
|---|---|---|
| `MOTION.fast` | `120ms ease` | Hover micro-interactions |
| `MOTION.normal` | `200ms ease` | Standard UI transitions |
| `MOTION.slow` | `350ms ease` | Panel/drawer animations |

**Forbidden:** Any raw timing string (`"200ms"`, `"0.2s ease-in-out"`, `"all 150ms linear"`). Use `MOTION.*` and compose with string interpolation when multiple properties need different timings.

---

## 5. Z-Index (`Z_INDEX`)

**Rule: Never use raw integers for `zIndex`. Always use the named layer constant.**

```tsx
import { Z_INDEX } from "../ui_primitives";

zIndex: Z_INDEX.raised    // 1   — slightly elevated in flow
zIndex: Z_INDEX.dropdown  // 10  — menus, popovers
zIndex: Z_INDEX.sticky    // 20  — sticky headers
zIndex: Z_INDEX.overlay   // 100 — backdrops
zIndex: Z_INDEX.modal     // 200 — dialogs
zIndex: Z_INDEX.tooltip   // 300 — tooltips
zIndex: Z_INDEX.toast     // 400 — toasts/notifications
```

**Forbidden:** `zIndex: 9999`, `zIndex: 1000`, `zIndex: 2` (unless it's `Z_INDEX.raised`).

---

## 6. Scrollbars (`scrollbarStyles`)

**Rule: Use `scrollbarStyles(theme)` wherever the standard app scrollbar appearance is needed.**

```tsx
import { scrollbarStyles } from "../ui_primitives/tokens";

css({
  overflowY: "auto",
  ...scrollbarStyles(theme),
})
```

Only use `scrollbarStyles` for the standard scroll appearance. Components that intentionally style their scrollbar differently (e.g. chat thread) keep their own styles.

---

## Migration Checklist

When editing any UI file, scan for these violations and fix them in the same PR:

| Violation | Fix |
|---|---|
| `borderRadius: 4` / `borderRadius: "10px"` | `BORDER_RADIUS.sm` / `BORDER_RADIUS.lg` |
| `transition: "all 200ms ease"` | `MOTION.all` |
| `transition: "background-color 150ms"` | `MOTION.background` |
| `fontSize: "13px"` / `fontSize: "0.85rem"` | `var(--fontSizeSmall)` or `<Label>` |
| `fontWeight: 700` | `600` (or remove if already sanctioned) |
| `padding: "5px 10px"` | `SPACING.xs` / `SPACING.md` |
| `gap: 5` / `gap: "10px"` | `SPACING.xs` / `SPACING.md` |
| `"var(--rounded-sm)"` string literal | `BORDER_RADIUS.sm` |
| `zIndex: 9999` | `Z_INDEX.modal` or `Z_INDEX.toast` |
| Raw `<Typography>` | `<Text>`, `<Label>`, or `<Caption>` |
| `display: "flex"` in sx | `<FlexRow>` / `<FlexColumn>` |

---

## Related Documents

- **[UI Primitives Strategy](../web/src/components/ui_primitives/STRATEGY.md)** — Full decision tree, migration rules, primitive catalog (90+ components), token API with all values
- **[Development Standards §5](DEVELOPMENT_STANDARDS.md#5-mui-v7--emotion--ui-primitives)** — Enforceable MUI/primitives rules
- **[tokens.ts](../web/src/components/ui_primitives/tokens.ts)** — Authoritative token definitions (SPACING, MOTION, BORDER_RADIUS, Z_INDEX, TYPOGRAPHY, scrollbarStyles)
- **[ThemeNodetool](../web/src/theme/)** — Where CSS variables (`--fontSize*`, `--rounded-*`) are defined
