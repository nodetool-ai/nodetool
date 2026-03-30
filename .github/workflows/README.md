# CI Workflows

## AI Agent Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **opencode.yml** | `/oc` comment on issue/PR | Interactive assistant — answers questions, investigates bugs, implements fixes on request |
| **quality-assurance.yaml** | Every 6h + manual | Fixes broken typecheck/lint/tests. Only runs Claude if checks are actually failing. |
| **security-audit.yaml** | Manual only | Scans for dependency CVEs, dangerous code patterns, and Electron misconfigurations |
| **dead-code-cleanup.yaml** | Weekly (Mon) + manual | Finds and removes unused exports, imports, unreachable code, and commented-out blocks |
| **type-safety.yaml** | Weekly (Wed) + manual | Replaces `any` types, adds missing return types, improves type narrowing |
| **performance-optimization.yaml** | Weekly (Fri) + manual | Fixes React performance issues: missing memo, useMemo/useCallback, inefficient selectors |
| **dependency-cleanup.yaml** | Monthly + manual | Removes unused dependencies, aligns versions, updates minor/patch versions |
| **test-coverage.yaml** | Weekly (Tue) + manual | Adds tests for uncovered utility functions, store actions, hooks, and components |

## Standard CI Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **test.yml** | Push/PR to main | Run full test suite (typecheck, lint, tests) across all packages |
| **e2e.yml** | Push/PR to main | Integration tests for websocket and backend packages |
| **autofix.yml** | PRs to main | Auto-fix ESLint issues and commit |
| **release.yaml** | Git tags `v*` + manual | Build and sign cross-platform release artifacts |
| **flatpak-ci.yml** | Push to main + manual | Build Flatpak desktop package |
| **jekyll.yml** | Push to main + manual | Build and deploy docs site to GitHub Pages |

## Reusable Workflows

| Workflow | Purpose |
|----------|---------|
| **quality-checks.yml** | Shared typecheck/lint/test job template |
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
```
