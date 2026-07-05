# React Component Streamlining Plan

Execution plan for finishing the [DESIGN.md](DESIGN.md) migration across `web/src`.
Numbers below were measured on 2026-07-05 by running `eslint --config
eslint.design.config.mjs src` plus targeted greps; re-measure before starting
each workstream ("measure" commands are inline).

## Where we are

Locked in (zero violations, lint at `error`):

- Spacing (`padding`/`margin`/`gap`, TSX + CSS)
- Font size and `fontWeight`
- Color (hex/rgb, TSX + CSS)
- Raw MUI component imports (`design-tokens/no-raw-mui`) — the only remaining
  `@mui/material` imports are sanctioned utilities (`useTheme` ×396, `Theme`
  type ×302, `alpha`, `useMediaQuery`, …)

Remaining `warn` backlog (from the design lint):

| Category | Warnings | Files | Concentration |
|---|---|---|---|
| `zIndex` magic integers | 160 | 99 | `node/` (41), `assets/` (31), `properties/` (14), `timeline/` (13) |
| `ui_primitives` deep imports (barrel bypass) | 60 | 36 | scattered |
| `borderRadius` magic values | 17 | 12 | scattered |
| `transition` raw timing (current rule) | 0 | 0 | rule is narrow — see workstream 4 |

Not yet linted, but forbidden or discouraged by DESIGN.md:

| Pattern | Count | Target |
|---|---|---|
| Raw `animation`/`animationDelay` timing + `.css` `transition` strings | ~41 TSX + ~20 CSS | `MOTION.*` / named constants |
| Raw `border-radius` px in `.css` | ~36 declarations, 7 files | `var(--rounded-*)` |
| `display: "flex"` in `sx` | 799 sites / 286 files | `FlexRow` / `FlexColumn` |
| `overflow: "auto"` containers | 136 sites | `ScrollArea` |
| `textOverflow: ellipsis` by hand | 88 sites | `TruncatedText` |
| Raw `@media (prefers-reduced-motion)` blocks | 3 files | `reducedMotion()` |

Underused composites (adoption today): `TruncatedText` 2, `FormField` 1,
`SectionHeader` 4, `CollapsibleSection` 11, `ScrollArea` 13, `EmptyState` 29.

## Workstreams

Ordered by leverage: each of 1–4 ends by promoting its lint rule to `error`,
which is what makes the win permanent. 5–6 are gradual.

### 1. Barrel deep imports — mechanical, ~1 PR

60 import lines across 36 files: `from ".../ui_primitives/Foo"` →
`from ".../ui_primitives"`. Pure find/replace; the barrel already re-exports
everything. Then promote `no-restricted-imports` to `error` in
`web/eslint.design.mjs`.

Measure: `grep -rn 'from "[^"]*ui_primitives/' web/src/components | grep -vE 'ui_primitives"|index"'`

### 2. borderRadius — small, ~1 PR

17 warnings in 12 files. Real offenders are `"50%"` (→ `BORDER_RADIUS.circle`),
`em` values (`"0.25em"`, `"0.2em"` → nearest token), and small numerics
(`2` → `BORDER_RADIUS.xs`…). `borderRadius: 0` is allowed (flush) and already
excluded by the rule. Also migrate the ~36 raw `border-radius` px declarations
in `web/src/styles/*.css` to `var(--rounded-*)`, and extend
`lint-spacing-css.mjs` (or a sibling script) to cover `border-radius` so CSS
stays locked too. Then promote the two borderRadius selectors to `error`.

### 3. zIndex — the big one, 4–5 PRs by directory

160 warnings in 99 files. This is not find/replace: each value participates in
a local stacking context, so map per cluster and verify visually
(`npm start`, exercise the surface). Suggested value mapping as a starting
point, to be confirmed per site:

| Found | Replace with |
|---|---|
| `1`–`5` (local layering) | `Z_INDEX.raised` or restructure to avoid z-index |
| `10`–`50` | `Z_INDEX.dropdown` / `Z_INDEX.sticky` |
| `100`–`400` | `Z_INDEX.overlay` / `modal` / `tooltip` / `toast` |
| `1000`+ | `theme.zIndex.*` (MUI/command layers) |

Split by concentration: PR a) `node/` + `node_menu/` (45), PR b) `assets/` +
`asset_viewer/` (38), PR c) `properties/` + `inputs/` + `widgets/` (23),
PR d) `timeline/` + `sketch/` (18), PR e) remainder (~36). Promote the zIndex
selector to `error` at the end.

### 4. Motion — close the rule gap, then fix, ~2 PRs

The current rule only catches `transition: "…ms…"` object properties, which is
why it reports zero while ~41 raw `animation`/`animationDelay` timings and ~20
`.css` transition strings remain.

1. Extend the lint: cover `animation`/`animationDelay`/`transitionDuration`
   properties, seconds (`0.3s`) as well as `ms`, and template-literal CSS —
   mirror how `spacingTokensRule` handles template literals. Add `transition`
   timing checks to the CSS lint script.
2. Keyframe loop durations (`1.6s`, `3s`, `5s` pulses/spins) don't fit
   `MOTION.fast/normal/slow`. Per DESIGN.md §11.5, add named constants (e.g.
   `MOTION.pulse`, `MOTION.spin`) rather than inlining — decide the set once,
   in the first PR.
3. While touching each animated component, add the missing `reducedMotion()`
   override (WCAG 2.3.3) and migrate the 3 raw `@media (prefers-reduced-motion)`
   blocks.
4. Promote to `error`.

### 5. Structural primitives — opportunistic + targeted sweeps

The checklist items that reduce duplication rather than fix tokens. Don't do a
big-bang rewrite of 286 files; instead:

- **Enforce on touch**: DESIGN.md §10 already requires fixing violations in any
  file you edit. Workstreams 1–4 will organically convert many sites.
- **Targeted sweeps** where the payoff is real, one directory per PR, largest
  clusters first: `display:"flex"` sx → `FlexRow`/`FlexColumn` (only where the
  shorthand props actually shrink the code — per CLAUDE.md, keep `Box` when
  heavy `sx` remains), `overflow:"auto"` → `ScrollArea`, `textOverflow` →
  `TruncatedText`.
- **Adopt composites when refactoring**: `FormField`, `SectionHeader`,
  `CollapsibleSection`, `EmptyState` replace hand-rolled versions of the same
  layout; use them whenever workstream PRs touch such a pattern.

No lint rule exists for these; consider a low-noise `warn` rule for
`display: "flex"` inside `sx` object literals after the sweep, not before.

### 6. Oversized components — fold into the above, don't schedule separately

94 components exceed 500 lines; the top offenders
(`TrackEffectsPanel` 2106, `TextEditorModal` 1662, `SketchLayersPanel` 1642,
`SketchNode` 1468, `MediaChatComposer` 1430) also carry many of the zIndex and
flex violations. When a workstream PR lands in one of these, split obvious
subcomponents (render blocks used once, inline dialogs) into siblings — but
only where extraction is mechanical. Deliberate decomposition of these five is
its own follow-up, out of scope here.

## Sequencing and verification

1. One category (or one directory of a category) per PR — reviewable diffs,
   easy revert.
2. Every PR: `npm run typecheck && npm run lint && npm run test`
   (`npm run lint` already chains `lint:design`).
3. zIndex and motion PRs additionally need a visual pass on the affected
   surface (`npm start`), since token swaps there can change stacking or feel.
4. Each of workstreams 1–4 ends with the `warn → error` promotion in
   `web/eslint.design.mjs` plus the matching status update in DESIGN.md
   ("Enforcement" section) — same PR.
5. Update this file's table counts as categories reach zero; delete the file
   when workstreams 1–4 are done and 5 is enforcement-on-touch only.

Rough order of work: 1 → 2 → 4 (rule change first exposes the true motion
backlog) → 3 (largest, parallelizable by directory) → 5 ongoing.
