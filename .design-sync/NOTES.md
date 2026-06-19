# design-sync notes — NodeTool Design System

Repo-specific gotchas for future syncs of `web/src/components/ui_primitives`.

## Source shape
- The "design system" is NOT a standalone package. It's the `ui_primitives/`
  directory inside the `web` Vite app (package name `nodetool`). There is no
  `dist/` build for it, so the converter runs in **synth-entry mode** (no
  `--entry`): it synthesizes an entry from every `*.tsx` under `cfg.srcDir` and
  discovers components from `src` (PascalCase value exports).
- `--node-modules` MUST be the repo root `node_modules` (`react`, `@mui/*`,
  `@emotion/*` are hoisted there, not in `web/node_modules`).
- `PKG_DIR` resolves via the existing npm-workspace symlink
  `node_modules/nodetool -> ../web`, so `cfg.srcDir` is `web`-relative
  (`src/components/ui_primitives`).

## Provider
- Primitives are theme-driven (MUI v7 + emotion). `.design-sync/provider.tsx`
  exports `DSProvider` (wraps `ThemeProvider theme={ThemeNodetool}` + CssBaseline)
  and is bundled via `cfg.extraEntries`; `cfg.provider.component = "DSProvider"`.
- `ThemeNodetool` imports `@fontsource/inter` + `@fontsource/jetbrains-mono`
  CSS, so the brand fonts get inlined into `_ds_bundle.css` (no extraFonts
  needed, in theory — verify after first build).

## Known issues
- `DeleteButton` imports `../../icons/trash.svg?react`. esbuild's default
  `.svg -> dataurl` loader strips the `?react` query, so the bundle BUILDS, but
  the icon becomes a data-URL string instead of a React component → its preview
  render fails ("Element type is invalid"). DeleteButton ships the floor card
  (skip authoring its preview).

## Authoring conventions (for re-syncs / new previews)
- Previews import from `"nodetool"`; the provider (DSProvider) auto-wraps in the
  dark theme — never add ThemeProvider. Use realistic NodeTool-domain content.
- Controlled components need a `React.useState` wrapper; uncontrolled use
  `defaultChecked`/`defaultValue`.
- `Chip` has NO `size` prop — use `compact`. There is no `Button` primitive
  exported; `ButtonGroup`'s preview imports MUI `Button` for its children.
- `ToggleGroup` (MUI ToggleButtonGroup): `exclusive` for single-select, guard
  `onChange={(_e,v)=> v && setValue(v)}` (value is null on deselect).
- `MenuItemPrimitive` needs a faux-menu wrapper to look right; `ListItemRow` goes
  inside `ListGroup`; `ToggleOption` inside `ToggleGroup`.
- Media: `ResponsiveImage` paints from `https://picsum.photos/id/<n>/<w>/<h>`;
  `VideoPlayer` decodes a frame from `https://www.w3schools.com/html/mov_bbb.mp4`.
- Overlays/portals (Dialog, Popover, ContextMenu, Tooltip, Toast, Overlay,
  DropZoneOverlay, MobileBottomSheet, PositionedDialog, DrawerPanel) have
  `cfg.overrides.<Name> = {cardMode:"single", viewport}` and are authored as one
  forced-open story. `DrawerPanel` must use the default `temporary` variant +
  `open` (NOT `variant="permanent"`, which renders an empty body).
- `InfoTooltip` exposes no `open`/`defaultOpen` prop — it can only show its
  trigger affordances statically, not the open bubble.

## Component bugs
- **Surface** (`Surface.tsx`) — FIXED. It read `theme.palette.background.*` /
  `theme.palette.divider` directly (the literal default/light-scheme values),
  rendering `background="paper"`/`"default"`/bordered Surfaces light-on-dark. Now
  reads `theme.vars.palette.*` (with a `?? theme.palette` fallback). Its preview
  showcases the real dark paper/default/elevation surfaces.
  - `SettingsButton.tsx:144` has the same shape (`alpha(theme.palette.background.paper,
    0.08)`) but `alpha()` can't take a `var()` string; it's a barely-visible hover
    tint that reads fine on dark, so it was left as-is.
- **HoverActionGroup** wrapping `DeleteButton` crashes ONLY in the design-sync
  esbuild bundle — same root cause as the `DeleteButton` svg issue below (the
  `svg?react` icon resolves to a data-URL string, not a component). In the real
  Vite app (svgr plugin) it works; NOT an app bug. The HoverActionGroup preview
  uses `EditButton` only to stay renderable in the bundle.

## Known render warns (triaged — recorded so re-syncs don't read them as new)
- `SectionHeader` trips a thin/blank flag on its `WithAction` cell (a header bar
  with no visible trailing action at rest) — legitimate, graded good.
- `DeleteButton` ships the floor card by design (svg?react icon, see below).

## Re-sync risks
- `cfg.extraEntries` uses an ABSOLUTE path to `.design-sync/provider.tsx`
  (a `../`-relative path breaks because `node_modules/nodetool` is a symlink and
  `resolve()` doesn't follow it upward). On a fresh clone on a different machine,
  update that absolute path to the new repo location before rebuilding.
- Components are CSS-in-JS (emotion/MUI sx), styled at runtime by the provider;
  expect `[CSS_RUNTIME]` (non-blocking) — the bundle is self-styling.
