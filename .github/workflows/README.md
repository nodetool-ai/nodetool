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

**Promotion tracked here**: `user-journeys.yml`'s legacy `journeys` job (the
browser suite) runs nightly today with `continue-on-error: true` so a flaky
night doesn't page anyone while the suite earns trust. It becomes a
**required** Ring 1 check, and `continue-on-error` flips to `false`, **from
2026-08-15**. That date lives in this file and in the workflow's own header
comment — update both together if it moves. The same workflow's
**`reliability-ring1`** job (added by F2) is a *separate* job with no such
grace period: it runs on every push to `main` and is required from day one —
see below.

| Workflow | Purpose | Ring | Required today? |
|---|---|---|---|
| `test.yml` | Full quality gate (typecheck, lint, tests) via `quality-checks.yml` | 0 | Required |
| `quality-checks.yml` | Reusable gate: deps/lint static legs, one shared build, five `built` legs (typecheck+parity+examples, test-packages, test-app, bundle+ring0, app-build), and a path-gated `docker` leg that builds the image, boots it, and loads the app in a browser | 0 | Required (infra called by `test.yml`) |
| `page-load-smoke.yml` | Playwright: every route loads against a seeded backend | 0 | Required |
| `e2e-runner.yml` | Browser-driven e2e_runner suite against the real backend stack | 1 | Required (also gates PRs today, ahead of the ring split) |
| `docker.yml` | Build and push the GHCR image (main, `preview/**`, tags) | 1 | Required |
| `fly-deploy.yml` | Deploy the GHCR image to Fly.io, gated on `docker.yml` + `user-journeys.yml`'s `reliability-ring1` both succeeding for the same commit | 1 | Required |
| `web-deploy.yml` | Build the web app and deploy to Cloudflare Pages | 1 | Required |
| `user-journeys.yml` | `journeys`: nightly Playwright journey suite (build a graph and run it, chat, mini app, library). `reliability-ring1` (on push to `main`, schedule, dispatch): full `reliability/journeys/*` suite on kernel+ws-server with `--diff`, plus one packaged-backend journey — gates `fly-deploy.yml` | 1 | `journeys`: advisory until 2026-08-15, then required. `reliability-ring1`: required |
| `release.yaml` | Cross-platform signed release artifacts, packed-tree smoke, a packed-backend reliability journey per OS, updater assets | 2 | Required |
| `example-smoke-debug.yml` | Nightly + manual real-provider smoke via `nodetool debug` | 2 | Nightly (spend-capped), also dispatch-only |
| `abstraction-improver.yaml` | Scheduled agent flattens single-implementation interfaces, forwarding wrappers, re-export-only barrels | none/maintenance | Advisory (`continue-on-error`) |
| `abstraction-police.yaml` | Scheduled agent fixes layering violations found by `check:*` plus the import greps no script covers | none/maintenance | Advisory (`continue-on-error`) |
| `anti-slop-ratchet.yaml` | Daily agent drives anti-slop (rule, tree) pairs to zero, regenerates the enforced overrides, and proves the new ratchet can fail. Every fourth run takes a large pair instead of a nearly-done tree — this is where the app trees' `as any` and missing return types are worked, since `type-safety.yaml` folded into it | none/maintenance | Advisory |
| `app-build-eval.yml` | Nightly `app-build` eval suite; reports the one-shot rate, gates nothing | none/maintenance | Advisory (report only) |
| `aur-publish.yml` | Publish the AUR package on a GitHub release | none/maintenance | Required for its own job |
| `claude-code-review.yml` | Claude reviews new/updated PRs | none/maintenance | Advisory |
| `claude.yml` | Claude responds to `@claude` mentions and comments | none/maintenance | Advisory |
| `copilot-setup-steps.yml` | Environment setup for the Copilot coding agent | none/maintenance | n/a (setup only) |
| `crash-fuzzer.yaml` | Daily fuzz of `validate` / `jsscript validate` / `node run` over mutated documents; agent root-causes each crash or hang | none/maintenance | Advisory (`continue-on-error`) |
| `dead-code-cleanup.yaml` | Scheduled agent removes unused exports/imports/code | none/maintenance | Advisory (`continue-on-error`) |
| `dependency-cleanup.yaml` | Scheduled agent prunes unused deps, aligns/updates versions | none/maintenance | Advisory (`continue-on-error`) |
| `docs-ci.yml` | Docs site build + internal link/image check on PR | none/maintenance | Required for `docs/**` |
| `docs-completeness.yaml` | Daily agent documents undocumented CLI commands, routes, env vars, packages | none/maintenance | Advisory |
| `docs-correctness.yaml` | Daily agent checks docs claims against the code and fixes stale ones | none/maintenance | Advisory |
| `docs-lint.yml` | Markdown lint on push/PR | none/maintenance | Required for `**/*.md` |
| `duplicate-unifier.yaml` | Scheduled agent merges duplicated implementations found by a sliding-window hash | none/maintenance | Advisory (`continue-on-error`) |
| `eas-build.yml` | Cloud-build the Expo app in `mobile/` on EAS | none/maintenance | Manual / tag-gated |
| `flaky-test-fixer.yaml` | Daily agent root-causes flakes from CI re-run history and randomized repeat runs | none/maintenance | Advisory (`continue-on-error`) |
| `flatpak-ci.yml` | Build the Flatpak desktop package | none/maintenance | Required for its own job |
| `genspend-pricing.yml` | Nightly GenSpend price sync; opens a PR when a price moved | none/maintenance | Advisory |
| `internal-only-shipper.yaml` | Scheduled agent ships or deletes features gated to dev/internal builds | none/maintenance | Advisory (`continue-on-error`) |
| `issue-triage.yml` | Labels new issues, flags duplicates, requests repro details | none/maintenance | n/a (read-only) |
| `jekyll.yml` | Build and deploy the docs site to GitHub Pages | none/maintenance | Required for docs deploy |
| `logic-bugfixer.yaml` | Scheduled agent models one decidable function, enumerates its inputs, and fixes divergences with a reproduction | none/maintenance | Advisory (`continue-on-error`) |
| `logic-simplifier.yaml` | Scheduled agent simplifies the logic in one branch-dense function | none/maintenance | Advisory (`continue-on-error`) |
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
| `shipped-feature-inliner.yaml` | Scheduled agent inlines flags whose feature has fully shipped | none/maintenance | Advisory (`continue-on-error`) |
| `test-coverage.yaml` | Scheduled agent adds tests for uncovered code | none/maintenance | Advisory (`continue-on-error`) |
| `ui-primitives-compliance.yaml` | Scheduled agent migrates raw MUI imports to `ui_primitives/`, fixes hardcoded design tokens | none/maintenance | Advisory (`continue-on-error`) |
| `useless-test-pruner.yaml` | Scheduled agent deletes or strengthens tests proven unable to fail under mutation | none/maintenance | Advisory (`continue-on-error`) |
| `workflow-example-validation.yaml` | Weekly `nodetool validate` + repair of shipped example workflows | none/maintenance | Advisory (`continue-on-error`) |

51 workflow files, 10 in the three rings (3 Ring 0, 5 Ring 1, 2 Ring 2), 41 none/maintenance.

F2 wires this table into the actual gates:

- **Ring 0**: `quality-checks.yml`'s `built` matrix runs `npm run
  reliability:ring0` (in the `bundle` leg) over the five journeys that exist
  under `reliability/journeys/` — linear-text-pipeline, fan-out-fan-in-dag,
  error-in-one-branch, mid-run-cancel-node, mid-run-cancel-streaming
  (journeys 1/3/6a/6b/13) — on the kernel surface, strict lifecycle mode
  always on (`reliability/harness/src/drivers/kernel.ts` passes
  `strict: true`, forwarded end-to-end via a new
  `ExecutionSessionOptions.strict` → `WorkflowRunnerOptions.strict`). Journey
  14 (malformed-protocol) has no harness journey directory yet — that
  coverage lives as `packages/websocket` tests. The leg counts toward the
  aggregate `quality` job like every other one.
- **Ring 1**: `user-journeys.yml` gained a `reliability-ring1` job (`npm run
  reliability:ring1 -- --packaged`) — every journey's cross-surface diff
  (kernel oracle vs. ws-server, `--diff`) plus one packaged-backend journey
  (linear-text-pipeline against a freshly staged `server.mjs`, the same
  staging `backend:smoke` uses). It runs on push to `main`, on the existing
  nightly schedule, and on dispatch, and is never `continue-on-error` — a
  failure fails the workflow run outright. `fly-deploy.yml` now
  workflow_run-triggers on both `docker.yml` and `user-journeys.yml`
  completing, and its new `gate` job polls the GitHub API for both
  workflows' conclusion on the triggering commit before `deploy` runs —
  whichever of the two finishes second is the run that actually reaches
  `deploy` (the other is superseded by `fly-deploy`'s existing
  `cancel-in-progress` concurrency group). Because that gate reads a
  per-commit conclusion, `user-journeys.yml` does not cancel superseded runs
  on `main` — a run cancelled by the next merge would read as "Ring 1 failed"
  and block the release. And when the gate does see a red or cancelled
  upstream for a commit `main` has already moved past, it skips the deploy
  instead of failing: that commit's image is not what anyone is releasing.
- **Ring 2**: `release.yaml` gained a per-OS "Reliability Ring 2
  packed-backend journey" step right after each OS's existing smoke-boot
  step, running linear-text-pipeline against that OS's packed backend
  (`scripts/reliability-packed-journey.mjs`) — same packed tree, same
  candidate-search pattern as the smoke-boot step. `example-smoke-debug.yml`
  is promoted from dispatch-only to a 04:15 UTC nightly (still keyless/local
  today, so no real spend yet — its header comment requires an explicit
  per-run cost budget on any future paid-model addition).

## Documentation-only pushes

A change to prose runs no code CI. Most workflows already carry a `paths`
filter that prose cannot match. `test.yml` cannot: its `quality` job is a
required status check, and a path-filtered required check is left Pending
forever on a push that matches nothing. So it triggers on every PR and decides
inside: a `changes` job classifies the diff, and the gate, the integration
tests and the browser E2E job skip when nothing but prose changed. A skipped
job counts as a pass for a required check, so the check still lands.

The prose set is `docs/**`, the Markdown at the repo root, `AGENTS.md` and
`CLAUDE.md` anywhere, and the Markdown under `.github/`. Markdown that code
reads at run time is deliberately outside it — a sandbox pack's `SKILL.md` or a
package `README.md` runs the full gate.

It fails safe in both directions: the filter step is `continue-on-error` and
its output falls back to "there is code here", and the legs skip only on an
explicit "prose only", so a `changes` job that never reported runs everything.

Prose still gets its own checks: `docs-lint.yml` on any `**/*.md`, and
`docs-ci.yml` (site build plus link check) on `docs/**`.

## Manual Trigger

```bash
gh workflow run security-audit.yaml
gh workflow run quality-assurance.yaml
gh workflow run dead-code-cleanup.yaml
gh workflow run performance-optimization.yaml
gh workflow run dependency-cleanup.yaml
gh workflow run test-coverage.yaml
gh workflow run ui-primitives-compliance.yaml
gh workflow run workflow-example-validation.yaml
gh workflow run docs-correctness.yaml
gh workflow run docs-completeness.yaml
gh workflow run crash-fuzzer.yaml
gh workflow run internal-only-shipper.yaml
gh workflow run logic-simplifier.yaml
gh workflow run logic-bugfixer.yaml
gh workflow run duplicate-unifier.yaml
gh workflow run useless-test-pruner.yaml
gh workflow run shipped-feature-inliner.yaml
gh workflow run flaky-test-fixer.yaml
gh workflow run abstraction-improver.yaml
gh workflow run abstraction-police.yaml
gh workflow run anti-slop-ratchet.yaml
gh workflow run example-smoke-debug.yml
gh workflow run user-journeys.yml
```
