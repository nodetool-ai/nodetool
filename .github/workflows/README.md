# CI Workflows

## Release rings

Validation is three rings; a release is a promotion through rings, not a
tag plus hope. Full definition: [`docs/RELIABILITY_ARCHITECTURE.md` §11](../../docs/RELIABILITY_ARCHITECTURE.md#11-release-engineering).

- **Ring 0 — PR gate (minutes).** Runs on every pull request. Hermetic, no
  network. **Flake budget: zero** — a Ring 0 job that flakes is a bug in
  the job, not a reason to add `continue-on-error`.
- **Ring 1 — merge-to-main (tens of minutes).** Full hermetic suite across
  surfaces (kernel, WS server, e2e_runner browser). Gates deploy — a
  failure here blocks `fly-deploy.yml`/`web-deploy.yml`, it doesn't just
  inform them.
- **Ring 2 — release candidate (hours, per-OS).** Packed-tree smoke on
  win/mac/linux, mcpb smoke, updater assets, and the real-provider
  nightly against live APIs with a spend cap.

Everything outside the three rings — scheduled autofix agents, docs and
marketing site builds, packaging side-channels (AUR, Flatpak, EAS), and
one-off maintenance triggers — is **none/maintenance**: useful, but not
part of the release gate and not held to the Ring 0 flake budget.

**Promotion tracked here**: `user-journeys.yml` runs nightly today with
`continue-on-error: true` so a flaky night doesn't page anyone while the
suite earns trust. It becomes a **required** Ring 1 check, and
`continue-on-error` flips to `false`, **from 2026-08-15**. That date lives
in this file and in the workflow's own header comment — update both
together if it moves.

| Workflow | Purpose | Ring | Required today? |
|---|---|---|---|
| `test.yml` | Full quality gate (typecheck, lint, tests) via `quality-checks.yml` | 0 | Required |
| `quality-checks.yml` | Reusable gate: deps/lint static legs, one shared build, typecheck/parity/package+app test legs | 0 | Required (infra called by `test.yml`) |
| `page-load-smoke.yml` | Playwright: every route loads against a seeded backend | 0 | Required |
| `chromatic.yml` | Storybook visual regression via Chromatic (TurboSnap) | 0 | Advisory (`exitZeroOnChanges`) |
| `visual-regression.yml` | Playwright screenshot diffs for the web UI | 0 | Advisory (`continue-on-error`, baselines still maturing) |
| `e2e-runner.yml` | Browser-driven e2e_runner suite against the real backend stack | 1 | Required (also gates PRs today, ahead of the ring split) |
| `docker.yml` | Build and push the GHCR image (main, `preview/**`, tags) | 1 | Required |
| `fly-deploy.yml` | Deploy the GHCR image to Fly.io after a successful Docker build | 1 | Required |
| `web-deploy.yml` | Build the web app and deploy to Cloudflare Pages | 1 | Required |
| `user-journeys.yml` | Nightly Playwright journey suite: build a graph and run it, chat, mini app, library | 1 | Advisory until 2026-08-15, then required |
| `release.yaml` | Cross-platform signed release artifacts, packed-tree smoke, updater assets | 2 | Required |
| `example-smoke-debug.yml` | Manual real-provider smoke via `nodetool debug` | 2 (target) | Advisory, dispatch-only |
| `aur-publish.yml` | Publish the AUR package on a GitHub release | none/maintenance | Required for its own job |
| `claude-code-review.yml` | Claude reviews new/updated PRs | none/maintenance | Advisory |
| `claude.yml` | Claude responds to `@claude` mentions and comments | none/maintenance | Advisory |
| `copilot-setup-steps.yml` | Environment setup for the Copilot coding agent | none/maintenance | n/a (setup only) |
| `dead-code-cleanup.yaml` | Scheduled agent removes unused exports/imports/code | none/maintenance | Advisory (`continue-on-error`) |
| `dependency-cleanup.yaml` | Scheduled agent prunes unused deps, aligns/updates versions | none/maintenance | Advisory (`continue-on-error`) |
| `docs-ci.yml` | Docs site build + internal link/image check on PR | none/maintenance | Required for `docs/**` |
| `docs-lint.yml` | Markdown lint on push/PR | none/maintenance | Required for `**/*.md` |
| `eas-build.yml` | Cloud-build the Expo app in `mobile/` on EAS | none/maintenance | Manual / tag-gated |
| `flatpak-ci.yml` | Build the Flatpak desktop package | none/maintenance | Required for its own job |
| `issue-triage.yml` | Labels new issues, flags duplicates, requests repro details | none/maintenance | n/a (read-only) |
| `jekyll.yml` | Build and deploy the docs site to GitHub Pages | none/maintenance | Required for docs deploy |
| `marketing-ci.yml` | Typecheck/lint/build/Playwright smoke for the marketing site; deploys to Cloudflare Workers on push to main | none/maintenance | Required for `marketing/**` |
| `model-watch.yml` | Weekly scan for new/changed provider models, files issues | none/maintenance | n/a |
| `mutation-testing.yaml` | Weekly Stryker mutation-testing report | none/maintenance | Advisory |
| `opencode.yml` | Interactive assistant on `/oc` comments | none/maintenance | Advisory |
| `performance-optimization.yaml` | Scheduled agent fixes React perf issues (memo, selectors) | none/maintenance | Advisory (`continue-on-error`) |
| `publish.yaml` | Publish npm packages on a `v*` tag | none/maintenance | Required for its own job |
| `quality-assurance.yaml` | Scheduled agent fixes failing typecheck/lint/tests | none/maintenance | Advisory (`continue-on-error`) |
| `quality-guard.yml` | Reusable pre/post quality-gate wrapper for the scheduled agent workflows | none/maintenance | Infra |
| `screenshots.yml` | Capture and commit documentation screenshots | none/maintenance | Manual |
| `security-audit.yaml` | Manual scan for dependency CVEs, dangerous patterns, Electron misconfig | none/maintenance | Advisory (`continue-on-error`) |
| `seo-seed.yml` | Seed SEO showcase assets via generation providers | none/maintenance | Manual |
| `test-coverage.yaml` | Scheduled agent adds tests for uncovered code | none/maintenance | Advisory (`continue-on-error`) |
| `type-safety.yaml` | Scheduled agent removes `any`, tightens types | none/maintenance | Advisory (`continue-on-error`) |
| `ui-primitives-compliance.yaml` | Scheduled agent migrates raw MUI imports to `ui_primitives/`, fixes hardcoded design tokens | none/maintenance | Advisory (`continue-on-error`) |
| `workflow-example-validation.yaml` | Weekly `nodetool validate` + repair of shipped example workflows | none/maintenance | Advisory (`continue-on-error`) |

38 workflow files, 12 in the three rings (5 Ring 0, 5 Ring 1, 2 Ring 2), 26 none/maintenance.

F2 wires this table into the actual gates: Ring 0 journeys (1/3/6/13/14,
kernel surface, strict mode) land in `quality-checks.yml`; Ring 1 gains the
full hermetic + differential + packaged-journey run gating
`fly-deploy.yml`; Ring 2 extends `release.yaml` with per-OS packed-backend
journeys and promotes `example-smoke-debug.yml` to a scheduled,
spend-capped nightly.

## Manual Trigger

```bash
gh workflow run security-audit.yaml
gh workflow run quality-assurance.yaml
gh workflow run dead-code-cleanup.yaml
gh workflow run type-safety.yaml
gh workflow run performance-optimization.yaml
gh workflow run dependency-cleanup.yaml
gh workflow run test-coverage.yaml
gh workflow run ui-primitives-compliance.yaml
gh workflow run workflow-example-validation.yaml
gh workflow run example-smoke-debug.yml
gh workflow run user-journeys.yml
```
