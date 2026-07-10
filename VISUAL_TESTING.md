# Visual Testing Guide

How NodeTool catches unintended UI changes (regressions) while still making it
easy to ship intentional design updates.

NodeTool uses a **hybrid visual regression stack**:

| Layer          | Tool                             | Covers                                                         | Baselines live in                 |
| :------------- | :------------------------------- | :------------------------------------------------------------- | :-------------------------------- |
| **Component**  | Storybook + Chromatic            | Design-system primitives, isolated components, token showcases | Chromatic (cloud)                 |
| **E2E / page** | Playwright screenshot assertions | Critical full-page user flows — node graph, settings, chat     | Repo (`web/tests/__snapshots__/`) |

The two layers complement each other: Chromatic gives fast, isolated coverage
of every story with a built-in PR review UI, while Playwright captures the
real app states that are impractical to model as isolated stories.

> **Visual regression vs. documentation screenshots.** NodeTool also has a
> `npm run screenshots` command (`.github/workflows/screenshots.yml`) that
> captures PNGs of the real UI into `docs/assets/screenshots/` for the docs
> site. Those are **capture-only** — they are not diffed and do not fail on
> change. This guide is about the **regression** layer that _does_ diff.

## Contents

- [How Visual Tests Work](#how-visual-tests-work)
- [Accepting Changes](#accepting-changes)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)
- [Team Workflow](#team-workflow)
- [Configuration Files](#configuration-files)
- [Determinism](#determinism)
- [Quick Reference](#quick-reference)

---

## How Visual Tests Work

### Component vs. E2E

- **Component tests (Storybook + Chromatic)** render a single component in
  isolation against controlled args/props. They are fast, deterministic, and
  isolate the cause of a change to one component. Use them for design-system
  primitives (buttons, inputs, chips, dialogs) and token showcases (color,
  spacing, typography, motion).
- **E2E visual tests (Playwright)** load a real app route in a browser and
  screenshot the full page or a region. They catch layout/integration
  regressions that only appear when components compose together with real
  data. Use them for a small, curated set of critical flows.

Keep the E2E visual set **small and deterministic** — every snapshot adds
baseline-maintenance cost. Prefer a Storybook story when a state can be
isolated; reach for Playwright only when it cannot.

### Chromatic workflow (Storybook)

1. A component's stories live next to it as `*.stories.tsx`
   (e.g. `web/src/components/foo/Foo.stories.tsx`).
2. On a PR, CI builds the static Storybook and publishes it to Chromatic.
3. Chromatic snapshots **every story** at the configured viewports and
   compares against the accepted baseline.
4. With TurboSnap (`onlyChanged`), Chromatic re-snapshots only the stories
   affected by the changed files, keeping the run well under the CI budget.
5. Changed stories show up as visual diffs in the Chromatic review UI, linked
   from the PR check.

Chromatic baselines are stored in Chromatic's cloud, **not** in the repo.
"Accepting" a change in the Chromatic UI updates the cloud baseline; the next
PR builds against the new baseline automatically.

### Playwright workflow (E2E pages)

1. A visual spec uses Playwright's `toHaveScreenshot()` assertion:
   ```ts
   await expect(page).toHaveScreenshot("node-graph.png");
   ```
2. The first run has no baseline, so Playwright writes one and the assertion
   passes. From then on, each run compares the captured screenshot against the
   committed baseline.
3. On mismatch, Playwright writes a diff image and the test fails. The
   [Playwright HTML report](https://playwright.dev/docs/test-reporters#html-reporter)
   shows the expected/actual/diff side by side.
4. Baselines are PNG files committed to the repo under
   `web/tests/__snapshots__/`.

The Playwright visual suite reuses the same harness as the documentation
screenshots: `web/tests/globalSetup.ts` boots the **real** NodeTool backend
(`packages/websocket/src/screenshot-server.ts`) with an in-memory SQLite
database pre-seeded with mock workflows, assets, threads, messages, and
secrets, and `playwright.config.ts` auto-starts the Vite dev server. Visual
specs therefore screenshot real components backed by a functional API rather
than a stub.

### Baseline snapshots and diffs

- A **baseline** is the "known-good" image a test compares against.
- A **diff** is the set of pixels that differ between the captured screenshot
  and the baseline, above the configured `threshold`.
- Small, sub-threshold differences (e.g. a single anti-aliased pixel from font
  hinting) do not fail the test. Large or structural differences do.

---

## Accepting Changes

When a visual change is **intentional**, accept it so it becomes the new
baseline. The flow differs by layer.

### For Chromatic (via the Chromatic UI)

```bash
# 1. Review the PR that has visual changes.
# 2. Click "View on Chromatic" on the PR check.
# 3. In Chromatic, walk through each changed story and Accept or Reject it.
# 4. Re-approve the PR once the changes you want are accepted.
# 5. Merge — Chromatic's cloud baseline updates automatically.
```

Chromatic baselines are **not** committed to the repo. There is nothing to
`git add`; acceptance happens entirely in the Chromatic review UI and is
attributed to the reviewer.

### For Playwright (local baseline update)

```bash
cd web

# Regenerate baselines for the snapshots that changed.
npm run test:visual:update

# Review the staged diffs in your editor / git GUI before committing —
# only commit baselines for changes you intended to make.
git status
git diff --stat

git add tests/__snapshots__
git commit -m "Update visual baselines"
```

`npm run test:visual:update` runs the visual suite with Playwright's
`--update-snapshots` flag, which rewrites the mismatched baseline PNGs in
`web/tests/__snapshots__/`. Push the commit; CI will then pass against the new
baselines.

> **Review before you commit.** Updating a baseline silently redefines
> "correct." Always look at the diff first — if a regression slipped in,
> fix the code instead of accepting the broken baseline.

---

## Common Scenarios

### Intentional UI change (e.g. new design token, restyled button)

- **Component:** Accept the affected stories in the Chromatic UI.
- **E2E:** Run `npm run test:visual:update` in `web/`, review the diffs, and
  commit the updated baselines with the rest of your change.

### Flaky test (passes locally, fails in CI, or vice-versa)

Flakiness in visual tests almost always comes from non-deterministic rendering.
Before reaching for a threshold bump:

1. Check for **animations** that haven't fully settled — add
   `await waitForAnimation(page)` (or `waitForPageReady`) before the
   screenshot. Playwright's `animations: "disabled"` option also helps.
2. Check for **async data** — wait for the specific element/text that proves
   the view is ready rather than a fixed `setTimeout`.
3. Check for **clock/time** dependencies — the Jest config pins `TZ=UTC`; for
   Playwright, mock `Date` or freeze the clock if a timestamp renders.

If the diff is genuinely sub-pixel noise, raise the `threshold` for that one
assertion (see [Configuration Files](#configuration-files)) — but treat this as
a last resort, since it also hides real regressions.

### New component

1. Add a `*.stories.tsx` next to the component. Chromatic auto-discovers and
   snapshots it on the next build — no baseline step needed.
2. If the component is part of a critical user flow, add a focused Playwright
   visual assertion. Otherwise, prefer the story; do not add an E2E snapshot
   "just in case."

### New E2E visual snapshot

1. Write the spec with `await expect(page).toHaveScreenshot("name.png")`.
2. Run `npm run test:visual` once to generate the initial baseline.
3. Inspect the generated PNG in `web/tests/__snapshots__/` — make sure it
   actually shows the state you intend to lock in (not a loading state).
4. Commit the spec **and** the baseline together.

### Cross-browser differences

Chromatic and the Playwright visual suite both run on **Chromium** only, by
design — pinning to one renderer keeps baselines stable and CI fast. Do not
add Firefox/WebKit visual projects without a clear reason; if you do, give
each browser its own baseline directory (`snapshotPathTemplate` per project)
and document the acceptable diffs here.

Known acceptable cross-renderer differences (none currently) should be listed
in this section so reviewers don't re-litigate them.

---

## Troubleshooting

### Font rendering differences (CI vs. local)

Symptom: a snapshot passes on your machine but fails in CI with diffs around
text.

- CI runs on a headless Linux runner whose system fonts differ from macOS /
  Windows. Chromatic normalizes fonts on its side, so this mainly affects
  Playwright.
- The NodeTool web app loads web fonts via Vite; make sure the font `@font-face`
  has finished loading before screenshotting — wait for
  `document.fonts.ready`:
  ```ts
  await page.evaluate(() => document.fonts.ready);
  ```
- Avoid screenshotting before web fonts swap in. If a font can't be loaded in
  CI, fall back to a pinned system font stack in the test environment.

### Animation timing issues

Symptom: intermittent diffs on components that animate in (dialogs, toasts,
expanding panels).

- Disable animations for the screenshot:
  ```ts
  await expect(page).toHaveScreenshot("dialog.png", {
    animations: "disabled"
  });
  ```
- Or explicitly wait for the animation to finish with `waitForAnimation(page)`
  from `web/tests/benchmarks/helpers/waitHelpers.ts`.
- Make sure the element is **stable** (not mid-transform) — Playwright's
  screenshot waits for layout to stabilize, but CSS `@keyframes` loops never
  settle and must be disabled.

### Viewport mismatch

Symptom: diff is the whole layout shifting or reflowing.

- The default Playwright project uses `viewport: { width: 1920, height: 1080 }`
  (see `web/playwright.config.ts`). The documentation-screenshot spec overrides
  to 1440×900. Visual specs must use the **same** viewport the baseline was
  captured at — do not change `use.viewport` for one test without regenerating
  its baseline.
- If you need a second viewport (e.g. mobile), add a separate Playwright
  **project** with its own baseline directory so the two don't clobber each
  other.

### Theme toggle not working in the snapshot

Symptom: dark-mode snapshot looks like light mode (or vice-versa), or the
toggle flickers between states.

- NodeTool persists theme in `localStorage`. Set it **before** navigation so
  React reads it on first mount (the screenshot spec does this for
  onboarding/panel state — see `seedLocalStorage` in
  `web/tests/benchmarks/screenshots.spec.ts` for the pattern).
- After toggling, wait for the theme class/attribute to apply and for the
  transition to finish before screenshotting:
  ```ts
  await page.evaluate(() => document.fonts.ready);
  await waitForAnimation(page, 500);
  ```

### "Snapshot does not exist" on CI but passes locally

The baseline PNG wasn't committed. `git add web/tests/__snapshots__/` and
commit it with the spec. Playwright writes baselines locally on first run but
does not create them for you on CI.

### WebGPU / Sketch canvas is blank in CI

The Sketch editor needs WebGPU, which isn't available on headless CI by
default. `web/playwright.config.ts` already enables SwiftShader
(`--use-gl=angle --use-angle=swiftshader --enable-webgpu-developer-features`),
and the E2E runner installs `mesa-vulkan-drivers` for lavapipe. If a Sketch
snapshot is blank, confirm those launch args / packages are present in the
job that ran it.

---

## Team Workflow

1. **PR opens.** Pushing a branch triggers the two visual workflows on the PR:
   `.github/workflows/chromatic.yml` builds Storybook and publishes it to
   Chromatic, and `.github/workflows/visual-regression.yml` runs the Playwright
   visual suite.
2. **Review changes.** Open the links the workflows leave on the PR:
   - The **Chromatic** check links to the per-story diff review UI.
   - The **Playwright** report is uploaded as a workflow artifact (expected /
     actual / diff images).
3. **Accept or fix.**
   - If the change is intentional, accept it: Chromatic changes via the UI,
     Playwright changes via `npm run test:visual:update` + a commit.
   - If the change is unintended, fix the code and push — the tests re-run.
4. **Merge.** Once visual checks are green (or accepted), merge the PR. On
   `main`, Chromatic's cloud baseline updates from the accepted changes, and
   the Playwright baselines you committed become the new source of truth.

> **Enforcement posture.** Per the infrastructure plan, visual checks start
> **non-blocking** — they report diffs first so the team can build stable
> baselines without blocking PR velocity. They switch to required once
> baselines are stable and the team is comfortable with the maintenance
> cadence. Treat "visual check failed" as a review signal, not a hard gate,
> until that switch is announced.

---

## Configuration Files

### `chromatic.config.json` (Chromatic)

Lives at the repo root. Configures the Chromatic CLI used by CI and the local
`npm run chromatic` script.

```jsonc
{
  "$schema": "https://www.chromatic.com/config-file.schema.json",
  "buildScriptName": "build-storybook", // Chromatic builds Storybook (+ TurboSnap stats)
  "storybookBaseDir": "web", // Storybook project root, relative to the repo (for TurboSnap)
  "onlyChanged": true, // TurboSnap: snapshot only affected stories
  "exitZeroOnChanges": true, // don't fail the build on new diffs (review in UI)
  "autoAcceptChanges": "main" // accept changes on main so merges update baselines
}
```

- `buildScriptName: "build-storybook"` lets Chromatic build Storybook itself, so
  it emits the TurboSnap stats file `onlyChanged` needs. No separate build step.
- `storybookBaseDir: "web"` tells TurboSnap where the Storybook project lives in
  the monorepo so it can map changed files to stories correctly.
- `onlyChanged: true` is what keeps Chromatic under the CI budget — it
  re-snapshots only stories reachable from changed files.
- `autoAcceptChanges: "main"` means pushes to `main` automatically become the
  new baseline (after a human accepted them on the PR). PR branches still
  surface diffs for review.
- `exitZeroOnChanges: true` keeps the workflow non-blocking while baselines
  stabilize: visual changes exit 0, so the check reports diffs without failing
  the PR. Build/infra errors still exit non-zero and fail the job.

The project token is **not** committed. It comes from the
`CHROMATIC_PROJECT_TOKEN` repository secret in CI (see below); locally, export
it as an env var before `npm run chromatic`.

#### `CHROMATIC_PROJECT_TOKEN` secret

The Chromatic workflow needs a `CHROMATIC_PROJECT_TOKEN` repository secret:

1. Create/connect the repo in [Chromatic](https://www.chromatic.com/) (via the
   GitHub App — this is also what posts the per-PR check and diff comment).
2. Copy the project token from **Manage → Configure** in Chromatic.
3. Add it under **Settings → Secrets and variables → Actions →
   `CHROMATIC_PROJECT_TOKEN`**.

Fork PRs can't read the secret, so the `chromatic` job skips on forks rather
than failing.

### `playwright.config.ts` (visual settings)

The visual suite reuses `web/playwright.config.ts`. The settings that matter
for deterministic visual regression:

```tsc
export default defineConfig({
  // ...
  retries: 0,                 // visual tests must be deterministic — no retries
  workers: 1,                 // sequential: avoid races writing snapshot files
  expect: {
    timeout: 10_000,
    // Visual diff tolerance. 0.2 = up to 0.2 per pixel default; raise per-test
    // only when a specific snapshot is genuinely noisy.
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.01, // fail if >1% of pixels differ
    },
  },
  use: {
    // Pin the viewport the baselines were captured at.
    viewport: { width: 1920, height: 1080 },
    // Centralize baselines under web/tests/__snapshots__/ instead of next to
    // each spec. Keep this stable — changing it invalidates every baseline.
    snapshotPathTemplate:
      "tests/__snapshots__/{projectName}/{testFilePath}/{arg}{ext}",
  },
});
```

Notes:

- **Do not change `viewport` or `snapshotPathTemplate` lightly** — either
  invalidates every existing baseline and forces a full `test:visual:update`.
- Per-snapshot options (e.g. `animations: "disabled"`, a different
  `threshold`) are passed to `toHaveScreenshot()` directly and override the
  config defaults for that one assertion.

### Visual CI workflows

The two visual layers run in **separate** workflows so each only fires when its
inputs change:

**`.github/workflows/chromatic.yml`** — component/Storybook layer. On PRs and on
`push` to `main` (paths: `web/src/**`, `web/.storybook/**`, `web/package.json`,
`chromatic.config.json`, the workflow itself) it:

1. Checks out with `fetch-depth: 0` (TurboSnap + baseline detection need full
   git history).
2. Sets up Node and installs deps via `.github/actions/setup-build`
   (`build-packages: false` — Storybook resolves `@nodetool-ai/*` to TS
   sources, so no package dist build is needed).
3. Runs `chromaui/action`, which builds Storybook (`buildScriptName`) and
   publishes it to Chromatic. Behaviour comes from `chromatic.config.json`:
   `onlyChanged` (TurboSnap), `exitZeroOnChanges` (non-blocking), and
   `autoAcceptChanges: main`.

The Chromatic **check** (and the GitHub App's PR comment) link to the per-story
diff review UI. `concurrency: cancel-in-progress` supersedes a stale run.

**`.github/workflows/visual-regression.yml`** — E2E/page layer (Playwright). On
PRs and `push` to `main` it builds the workspace packages, installs the
Playwright browsers, runs `npm run test:visual`, and uploads the HTML report +
diff images as an artifact. It also starts non-blocking (`continue-on-error`)
while baselines mature, and offers a `workflow_dispatch` `update=true` path to
regenerate and commit baselines in CI.

Both start non-blocking (visual failures warn but don't fail the gate) until
baselines are stable; only build/infra errors fail the job.

---

## Determinism

Visual tests are only useful if a clean checkout produces the same pixels as
the baseline. The infrastructure plan pins everything that affects rendering:

- **Animations** — disabled or settled before screenshotting
  (`waitForAnimation`, `animations: "disabled"`).
- **Fonts** — wait for `document.fonts.ready`; web fonts are bundled by Vite
  so they load identically in CI.
- **Theme** — set in `localStorage` before navigation so the first paint is
  already in the target theme.
- **Viewport** — pinned per Playwright project; never changed mid-suite.
- **Data** — the real backend boots against an in-memory SQLite DB seeded
  with deterministic mock data (see `web/tests/globalSetup.ts` and
  `web/tests/benchmarks/helpers/mockData.ts`). No network, no live model
  calls, no real assets.
- **Clock** — `TZ=UTC` for time-dependent rendering.

If you add a visual spec, follow these conventions. A test that depends on the
network, a live API key, or wall-clock time will flake and erode trust in the
whole suite.

---

## Quick Reference

| Task                                         | Command                                 |
| :------------------------------------------- | :-------------------------------------- |
| Run Playwright visual suite                  | `cd web && npm run test:visual`         |
| Update Playwright baselines                  | `cd web && npm run test:visual:update`  |
| Open Playwright UI (local iteration)         | `cd web && npm run test:visual -- --ui` |
| Run Chromatic locally                        | `CHROMATIC_PROJECT_TOKEN=… npm run chromatic` |
| Build Storybook locally                      | `cd web && npm run build-storybook`     |
| Capture **doc** screenshots (not regression) | `npm run screenshots`                   |

| Where                   | Path                                              |
| :---------------------- | :------------------------------------------------ |
| Playwright config       | `web/playwright.config.ts`                        |
| Playwright visual specs | `web/tests/visual/` (and `web/tests/benchmarks/`) |
| Playwright baselines    | `web/tests/__snapshots__/` (committed)            |
| Storybook stories       | `web/src/**/*.stories.tsx`                        |
| Storybook build output  | `web/storybook-static/`                           |
| Chromatic config        | `chromatic.config.json` (repo root)               |
| Chromatic CI workflow   | `.github/workflows/chromatic.yml`                 |
| Playwright CI workflow  | `.github/workflows/visual-regression.yml`         |
| Determinism helpers     | `web/tests/benchmarks/helpers/`                   |
| Backend test harness    | `web/tests/globalSetup.ts`                        |

For general (non-visual) testing, see [web/TESTING.md](web/TESTING.md).
