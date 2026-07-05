# CI Workflows

## AI Agent Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **opencode.yml** | `/oc` comment on issue/PR | Interactive assistant — answers questions, investigates bugs, implements fixes on request |
| **quality-assurance.yaml** | Every 6h + manual | Fixes broken typecheck/lint/tests. Only runs Claude if checks are actually failing. |
| **security-audit.yaml** | Manual only | Scans for dependency CVEs, dangerous code patterns, and Electron misconfigurations |
| **dead-code-cleanup.yaml** | Daily 3am + manual | Finds and removes unused exports, imports, unreachable code, and commented-out blocks |
| **type-safety.yaml** | Daily 3am + manual | Replaces `any` types, adds missing return types, improves type narrowing |
| **performance-optimization.yaml** | Daily 3am + manual | Fixes React performance issues: missing memo, useMemo/useCallback, inefficient selectors |
| **dependency-cleanup.yaml** | Daily 3am + manual | Removes unused dependencies, aligns versions, updates minor/patch versions |
| **test-coverage.yaml** | Daily 3am + manual | Adds tests for uncovered utility functions, store actions, hooks, and components |
| **ui-primitives-compliance.yaml** | Weekly (Tue 3am) + manual | Migrates raw `@mui/material` imports to `ui_primitives/` and replaces hardcoded design tokens (radii, transitions, font sizes, off-grid spacing) with the named constants — a small verified batch per run |
| **workflow-example-validation.yaml** | Weekly (Thu 3am) + manual | Runs `nodetool validate` over every shipped example workflow and repairs graphs broken by registry drift (unknown node types, missing required props, unselected models, dangling edges) |
| **issue-triage.yml** | Issue opened | Labels new issues, flags likely duplicates, and requests missing reproduction details for bug reports (comment/label only — read-only on code) |

## Standard CI Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **test.yml** | Push/PR to main | Run full test suite (typecheck, lint, tests) across all packages |
| **e2e.yml** | Push/PR to main | Integration tests for websocket and backend packages |
| **autofix.yml** | PRs to main | Auto-fix ESLint issues and commit |
| **release.yaml** | Git tags `v*` + manual | Build and sign cross-platform release artifacts |
| **flatpak-ci.yml** | Push to main + manual | Build Flatpak desktop package |
| **jekyll.yml** | Push to main + manual | Build and deploy docs site to GitHub Pages |
| **marketing-ci.yml** | Push/PR touching `marketing/**` | Typecheck, lint, build & Playwright smoke tests for the marketing site; on push to main, deploys it to Cloudflare Workers (OpenNext) after the gates pass |
| **web-deploy.yml** | Push to main (+ manual) | Build the web app (Vite) and deploy it to Cloudflare Pages |

## Reusable Workflows

| Workflow | Purpose |
|----------|---------|
| **quality-checks.yml** | Shared quality gate: no-build `static` legs (deps/lint), a single `build` job that publishes package dist as an artifact, `built` legs (typecheck/parity/package+app tests) that consume it instead of rebuilding, and an aggregating `quality` gate job |
| **quality-guard.yml** | Pre/post quality gate wrapper |
| **copilot-setup-steps.yml** | Environment setup for Copilot agents |

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
```
