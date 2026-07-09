# E2E Visual Regression Tests

Playwright `toHaveScreenshot` assertions that guard the critical NodeTool user
flows against page-level UI regressions. They complement the documentation
screenshot suite (`tests/benchmarks/screenshots.spec.ts`, which only *writes*
PNGs for the docs) by **comparing** against committed baselines and failing on
unexpected pixel diffs.

## What's covered

| Spec | Flow |
| --- | --- |
| `node-graph.spec.ts` | Empty canvas · nodes+edges · inspector panel · node library · timeline editor |
| `chat.spec.ts` | Empty conversation · message thread · media composer · model selector · dashboard |
| `settings.spec.ts` | API Keys (provider cards) · Integrations · General · About |
| `design-system.spec.ts` | Color picker · recommended-models · image comparer · layout primitives |
| `theme.spec.ts` | Dashboard / chat / settings captured in **light** mode (dark is the default elsewhere) |

That's **20 distinct page states** across the critical flows.

## Projects (browser × viewport)

Defined in `playwright.visual.config.ts`:

| Project | Browser | Viewport | Which tests |
| --- | --- | --- | --- |
| `desktop-chromium` | Chromium | 1440×900 | **all** visual tests |
| `mobile-chromium` | Chromium | 375×812 | tests tagged `@responsive` |
| `tablet-chromium` | Chromium | 768×1024 | tests tagged `@responsive` |
| `firefox-desktop` | Firefox | 1440×900 | tests tagged `@smoke` (cross-browser guard) |

Tag individual tests in their title, e.g.
`test('chat empty @responsive @smoke', ...)`.

## Running locally

Prerequisites (same as the documentation screenshot suite):

```bash
# from the repo root — build @nodetool-ai/* dist the backend imports
npm run build:packages
```

Then from `web/`:

```bash
npm run test:visual            # run all projects
npm run test:visual:headed     # watch it run
npm run test:visual -- --grep @smoke          # just the smoke subset
npm run test:visual -- --project desktop-chromium   # one project
```

The first run auto-starts the Vite dev server (port 3000) and the seeded real
backend (port 7777) via `tests/globalSetup.ts`. To reuse an already-running
`npm run dev`, just leave it up — `reuseExistingServer` is on locally.

## Updating baselines

Baselines live next to each spec in `<spec>.spec.ts-snapshots/` and **are
committed to the repo** — that's what makes regression enforcement work.

When you intentionally change the UI:

```bash
# Regenerate every baseline (writes the new expected images)
npm run test:visual:update

# Or regenerate just one project/test
npm run test:visual -- --project desktop-chromium --update-snapshots --grep "chat empty"
```

Then review the `git diff` of the PNGs and commit:

```bash
git add web/tests/visual/**/*-snapshots/
git commit -m "chore(visual): update baselines for <change>"
```

### Updating baselines in CI (no local setup)

The **Visual Regression** workflow has a `workflow_dispatch` input
`update=true` that regenerates baselines on the selected branch and commits
them automatically (`update-baselines` job). Use it to bootstrap the initial
baselines or to accept a batch of intentional changes without installing
Playwright locally.

### Bootstrapping baselines for the first time

Playwright defaults to `updateSnapshots: "missing"`: when a baseline is
**missing** it is written to disk, but the test **fails** with
`A snapshot doesn't exist ... writing actual.` so the new baseline is
acknowledged and committed rather than silently accepted. An **existing**
baseline that differs also fails.

So the first CI run on a PR without baselines will fail while writing them,
and upload the generated `*-snapshots/` folders as a `visual-regression`
artifact. Download it, drop the folders into `web/tests/visual/`, commit — or
run the `update=true` dispatch on the PR branch, which regenerates and commits
them for you. The initial baselines for this suite are already committed in
this change, so PRs fail only on genuine diffs.

## Keeping tests stable (no flaky results)

Determinism is enforced in `visualHelpers.ts`:

- **Backend**: the in-memory SQLite screenshot server seeds fixed mock data
  (workflows, threads, assets, secrets). No clock, no network, no real auth.
- **Theme**: written to `localStorage["mode"]` (MUI's `modeStorageKey`) *before* first paint.
- **Animations**: a global init script zeroes every CSS transition/animation;
  `toHaveScreenshot({ animations: "disabled" })` freezes the rest at capture.
- **Viewport**: pinned per project.
- **Onboarding / panels**: seeded via the persisted-store shapes the app reads
  on mount, so layouts are reproducible.
- **Single worker, no retries**: a flaky diff gets fixed, not hidden.
- **Tolerance**: `maxDiffPixelRatio: 0.01` absorbs sub-pixel font-hinting /
  anti-aliasing variance between Chromium and Firefox; anything larger fails.

If a test is genuinely flaky, prefer masking the volatile region
(`toHaveScreenshot(name, { mask: [locator] })`) over raising the tolerance.

## CI

- Triggers on PRs touching `web/tests/visual/**`, `web/src/**`, `web/package.json`,
  or the config/workflow itself (see `.github/workflows/visual-regression.yml`).
- Builds packages, installs Chromium + Firefox with deps, runs the suite.
- Uploads the baselines + HTML report (with side-by-side diffs) as an artifact
  on every run, retained 30 days.
- Fails the PR on unexpected diffs (baselines are committed in-tree).

> **Firefox scope.** The `firefox-desktop` project runs the chat + settings
> `@smoke` tests only. The node-graph editor is Chromium-only — Firefox closes
> the page when the editor mounts (likely a WebGPU/canvas init crash), so it is
> excluded from the cross-browser smoke set.

## Typechecking

The visual specs aren't covered by `web/tsconfig.json` (which only includes
`src/`). Typecheck them with:

```bash
npm run typecheck:visual
```
