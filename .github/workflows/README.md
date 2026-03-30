# CI Workflows

## AI Agent Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **opencode.yml** | `/oc` comment on issue/PR | Interactive assistant — answers questions, investigates bugs, implements fixes on request |
| **quality-assurance.yaml** | Every 6h + manual | Fixes broken typecheck/lint/tests. Only runs Claude if checks are actually failing. |
| **security-audit.yaml** | Manual only | Scans for dependency CVEs, dangerous code patterns, and Electron misconfigurations |

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
```
