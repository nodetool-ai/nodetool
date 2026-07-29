# Storybook

Component catalog and visual-regression source for the NodeTool design system.
Chromatic (set up by the CI task) snapshots these stories on every PR.

## Run

```bash
npm run storybook          # dev server on :6006 (from repo root or web/)
npm run build-storybook    # static build → web/storybook-static/
```

## Layout

- `main.ts` — framework (`@storybook/react-vite`), story globs, and the Vite
  overrides that mirror the app: the `nodetool-dev` resolve condition and the
  `node:*` builtin stubs from `web/vite-node-stubs`.
- `preview.tsx` — global decorators: the app MUI theme (`ThemeNodetool`) with
  `CssBaseline`, plus two toolbar globals.
- `../src/stories/**` — the stories. Primitives are deep-imported per file so a
  single story never pulls the whole `ui_primitives` barrel (and its runtime
  deps) into the bundle. `src/stories/**` is exempt from the design-token lint
  (`web/eslint.design.mjs`) as a harness, like `src/demo/` and `src/e2e_runner/`.

## Deterministic snapshots

Two toolbar globals keep Chromatic diffs stable:

- **Theme** — `dark` (default, the app baseline) or `light`.
- **Motion** — `Frozen` (default) zeroes every transition/animation duration and
  hides the caret so snapshots never catch a mid-animation frame; `Animated`
  restores real motion for local inspection.

Fonts are self-hosted (Inter + JetBrains Mono via `@fontsource`, imported by
`ThemeNodetool`), so text renders identically in CI.
