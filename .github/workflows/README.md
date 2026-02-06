# CI Agent Workflows

Automated AI agent workflows for code quality, features, and maintenance. All use Claude Sonnet via `anthropics/claude-code-action@v1`.

## Workflows

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| **opencode.yml** | `/oc` comment | Interactive assistant for issues/PRs |
| **feature-development.yaml** | Every 6h | Develop new features |
| **quality-assurance.yaml** | Every 6h | Fix typecheck/lint/test failures |
| **code-quality.yaml** | Every 6h | Fix code quality issues and tech debt |
| **docs-quality.yaml** | Mondays | Audit and improve documentation |
| **accessibility-audit.yaml** | Tuesdays | WCAG 2.1 AA compliance |
| **security-audit.yaml** | Wednesdays | Dependency and code security |
| **research.yaml** | Thursdays | Prototype experimental features |
| **performance-monitor.yaml** | Hourly | React re-renders, bundle size, memory |
| **test-coverage.yaml** | Saturdays | Add tests for uncovered code |
| **quality-guard.yml** | Reusable | Pre/post quality checks for other workflows |

## Memory System

All workflows read from `.memory/`:
- `features.md` — existing features (prevents duplicates)
- `project-context.md` — architecture and recent changes
- `build-test-lint.md` — quality commands
- `issues/` — known issues by topic
- `insights/` — best practices by topic

## Quality Gate

All workflows enforce: `make typecheck && make lint && make test` must pass.

## Manual Trigger

```bash
gh workflow run docs-quality.yaml
gh workflow run security-audit.yaml
gh workflow run performance-monitor.yaml
```
