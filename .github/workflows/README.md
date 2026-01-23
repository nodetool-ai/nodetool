# OpenCode Workflows Documentation

This directory contains GitHub Actions workflows for automated code quality, feature development, and maintenance using OpenCode AI agents.

## Overview

OpenCode workflows are autonomous AI agents that work on scheduled intervals to improve the NodeTool codebase. Each workflow focuses on a specific aspect of code quality or development.

## Workflow Categories

### 🤖 Core Workflows (Existing)

#### 1. **opencode.yml** - Manual Issue Resolution
- **Trigger**: Issue/PR comment with `/oc` or `/opencode`
- **Purpose**: Responds to manual requests for code changes
- **Use**: Comment `/oc [your request]` on issues or PRs

#### 2. **opencode-features.yaml** - Feature Development
- **Schedule**: Every 6 hours (cron: `45 * * * *`)
- **Purpose**: Autonomously adds new features
- **Focus**: User-facing features, UI improvements, new capabilities

#### 3. **opencode-hourly-test.yaml** - Quality Assurance
- **Schedule**: Every 6 hours (cron: `0 */6 * * *`)
- **Purpose**: Runs quality checks and fixes issues
- **Focus**: TypeScript errors, lint issues, test failures

#### 4. **opencode-hourly-improve.yaml** - Code Quality
- **Schedule**: Every 6 hours (cron: `30 */6 * * *`)
- **Purpose**: Scans for code quality issues and technical debt
- **Focus**: Performance, best practices, refactoring

### 📚 New Specialized Workflows

#### 5. **opencode-docs-quality.yaml** - Documentation Quality
- **Schedule**: Weekly on Mondays at 8 AM UTC (cron: `0 8 * * 1`)
- **Purpose**: Audits and improves documentation
- **Focus**: 
  - AGENTS.md files accuracy
  - JSDoc comments
  - README completeness
  - Code examples validity
  - Broken links

**Why It Helps**:
- **Users**: Better onboarding and feature understanding
- **Developers**: Clear API documentation and patterns
- **Researchers**: Comprehensive architecture documentation

#### 6. **opencode-security-audit.yaml** - Security Audit
- **Schedule**: Weekly on Wednesdays at 10 AM UTC (cron: `0 10 * * 3`)
- **Purpose**: Finds and fixes security vulnerabilities
- **Focus**:
  - Dependency vulnerabilities (npm audit)
  - XSS prevention
  - Input sanitization
  - Secrets management
  - Electron security

**Why It Helps**:
- **Users**: Protects their data and API keys
- **Developers**: Prevents security regressions
- **Researchers**: Ensures privacy for sensitive experiments

#### 7. **opencode-performance.yaml** - Performance Monitoring
- **Schedule**: Weekly on Fridays at 2 PM UTC (cron: `0 14 * * 5`)
- **Purpose**: Identifies and fixes performance bottlenecks
- **Focus**:
  - React re-render optimization
  - Bundle size reduction
  - Memory leak detection
  - List virtualization
  - Expensive calculations

**Why It Helps**:
- **Users**: Faster, more responsive interface
- **Developers**: Better development experience
- **Researchers**: Handle larger workflows efficiently

#### 8. **opencode-accessibility.yaml** - Accessibility Audit
- **Schedule**: Weekly on Tuesdays at noon UTC (cron: `0 12 * * 2`)
- **Purpose**: Improves accessibility for all users
- **Focus**:
  - Keyboard navigation
  - Screen reader support
  - Color contrast (WCAG 2.1 AA)
  - ARIA labels
  - Form accessibility

**Why It Helps**:
- **Users**: Accessible to people with disabilities
- **Developers**: Better UX for everyone
- **Researchers**: Inclusive research tools

#### 9. **opencode-research.yaml** - Research Features
- **Schedule**: Weekly on Thursdays at 4 PM UTC (cron: `0 16 * * 4`)
- **Purpose**: Explores and prototypes innovative features
- **Focus**:
  - AI-assisted workflow features
  - Experiment tracking
  - Visual debugging
  - Collaboration tools
  - Novel UX patterns

**Why It Helps**:
- **Users**: Innovative features that simplify workflows
- **Developers**: Extensibility and plugin systems
- **Researchers**: Advanced analysis and experiment tracking

#### 10. **opencode-coverage.yaml** - Test Coverage
- **Schedule**: Weekly on Saturdays at 9 AM UTC (cron: `0 9 * * 6`)
- **Purpose**: Increases test coverage for critical code
- **Focus**:
  - Zustand stores
  - Custom hooks
  - Utility functions
  - Complex components
  - Edge cases

**Why It Helps**:
- **Users**: Fewer bugs and regressions
- **Developers**: Confidence when refactoring
- **Researchers**: Reliable platform for experiments

## Workflow Schedule Summary

| Day | Time (UTC) | Workflow | Focus |
|-----|------------|----------|-------|
| Monday | 8:00 AM | Documentation Quality | Docs accuracy |
| Tuesday | 12:00 PM | Accessibility Audit | A11y compliance |
| Wednesday | 10:00 AM | Security Audit | Vulnerability fixes |
| Thursday | 4:00 PM | Research Features | Innovation |
| Friday | 2:00 PM | Performance | Speed optimization |
| Saturday | 9:00 AM | Test Coverage | Test additions |
| **Continuous** | Every 6h | Feature Development | New features |
| **Continuous** | Every 6h | Quality Assurance | Bug fixes |
| **Continuous** | Every 6h | Code Quality | Technical debt |

## How Workflows Work

### Architecture

```
┌─────────────────┐
│  GitHub Event   │ (schedule, comment, PR)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Workflow YAML  │ (defines job, steps, permissions)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Setup Steps   │ (checkout, install deps, run checks)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenCode Agent │ (AI reads prompt, makes changes)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Memory System  │ (reads context, updates learnings)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Quality Checks │ (typecheck, lint, test)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Create PR     │ (commit changes, open pull request)
└─────────────────┘
```

### Memory System

All workflows use the memory system in `.github/opencode-memory/`:

- **features.md**: Complete list of existing features (prevents duplicates)
- **project-context.md**: Architecture and recent changes
- **build-test-lint.md**: Quality requirements
- **tech-stack.md**: Technologies and versions
- **common-issues.md**: Known problems and solutions
- **insights.md**: Important learnings

**Memory Flow**:
1. **Read** memory files before starting work
2. **Work** on assigned task
3. **Update** memory with new learnings
4. **Compact** memory files (`python scripts/compact-memory.py`)
5. **Commit** changes with updated memory

## Best Practices for Workflows

### Prompt Design

Each workflow prompt includes:
1. **Mission**: Clear objective
2. **Context**: Project information
3. **Duplicate Check**: Avoid redundant work
4. **Memory Integration**: Read relevant memory
5. **Step-by-step Guide**: Detailed instructions
6. **Examples**: Code patterns and anti-patterns
7. **Quality Standards**: Non-negotiable requirements
8. **Memory Updates**: Document learnings

### Quality Gates

**NEW: Automated Quality Guardrails** 🛡️

All OpenCode workflows now include automated quality guardrails to prevent code quality degradation:

#### Pre-Flight Check (Before Agent Runs)
- Runs `make typecheck`, `make lint`, and `make test`
- Establishes baseline quality state
- Documents pre-existing issues
- Provides context to OpenCode agent

#### Post-Change Verification (After Agent Completes)
- Re-runs all quality checks
- Compares to pre-flight baseline
- **Fails workflow** if NEW errors introduced
- Provides detailed error reports

#### Quality Gate Rules

✅ **PASS**:
- No new errors introduced
- Maintains or improves quality
- All three checks pass: `make typecheck lint test`

❌ **FAIL**:
- New TypeScript errors
- New lint errors
- New test failures

**See [Quality Guardrails Documentation](../opencode-memory/quality-guardrails.md) for details.**

### Quality Check Commands

All workflows must pass:
```bash
make typecheck  # TypeScript type check
make lint       # ESLint validation
make test       # Jest test suite
make check      # All three checks combined
```

Auto-fix lint issues:
```bash
make lint-fix   # Auto-fix many lint issues
```

### Permissions

Workflows need specific GitHub permissions:
- `id-token: write` - OpenCode authentication
- `contents: write` - Create commits
- `pull-requests: write` - Open PRs
- `issues: write` - Create issues
- `security-events: write` - Security scanning (audit workflow)

## Manual Triggering

All new workflows support `workflow_dispatch` for manual runs:

```bash
# Via GitHub UI
Actions → Select workflow → Run workflow

# Via GitHub CLI
gh workflow run opencode-docs-quality.yaml
gh workflow run opencode-security-audit.yaml
gh workflow run opencode-performance.yaml
gh workflow run opencode-accessibility.yaml
gh workflow run opencode-research.yaml
gh workflow run opencode-coverage.yaml
```

## Monitoring Workflows

### View Workflow Runs

1. Go to GitHub Actions tab
2. Select workflow from sidebar
3. View run history and logs

### Check PR Status

Workflows create PRs with:
- Descriptive title
- Detailed description
- Changes summary
- Quality check results

### Review Memory Updates

After each run, check `.github/opencode-memory/` for:
- New features documented
- Solutions to problems
- Patterns discovered
- Updated context

## Customizing Workflows

### Adjust Schedule

Edit cron expression in workflow file:
```yaml
on:
  schedule:
    - cron: "0 8 * * 1"  # Weekly Monday 8 AM
```

Cron format: `minute hour day-of-month month day-of-week`

### Modify Focus Areas

Edit the workflow prompt to:
- Add new areas to check
- Change priority of issues
- Add custom quality criteria
- Include project-specific checks

### Change Model

Update model in workflow:
```yaml
with:
  model: zai-coding-plan/glm-4.7  # or other supported models
```

## Troubleshooting

### Workflow Failed

1. Check workflow logs in GitHub Actions
2. Look for error messages
3. Review which step failed
4. Check if quality gates passed

### Memory Conflicts

If memory files have conflicts:
1. Manually resolve conflicts
2. Run compaction: `python scripts/compact-memory.py`
3. Commit resolved version

### Duplicate Work

If workflows create duplicate PRs:
1. Check branch naming strategy
2. Review memory system integration
3. Ensure workflows read `features.md`

## Impact Metrics

### For Users
- **Better docs**: Faster onboarding
- **Fewer bugs**: More stable experience
- **Faster UI**: Better performance
- **Accessible**: Usable by everyone
- **Secure**: Protected data

### For Developers
- **Quality code**: Easier maintenance
- **Good tests**: Confident refactoring
- **Clear patterns**: Faster development
- **Updated deps**: Security and features
- **Documentation**: Quick reference

### For Researchers
- **Reliable platform**: Reproducible experiments
- **Performance**: Handle large workflows
- **Security**: Privacy for sensitive data
- **Features**: Advanced analysis tools
- **Extensibility**: Custom integrations

## Future Enhancements

Potential new workflows:
- **API compatibility checker**: Ensure backward compatibility
- **Dependency update bot**: Keep packages current
- **Changelog generator**: Auto-generate release notes
- **Visual regression testing**: Catch UI changes
- **Load testing**: Performance under stress
- **Mobile-specific quality**: React Native checks

## Contributing

To add a new workflow:

1. Create workflow file: `.github/workflows/opencode-[name].yaml`
2. Follow existing workflow structure
3. Include comprehensive prompt
4. Integrate with memory system
5. Add quality gates
6. Update this README
7. Test with manual trigger
8. Monitor first few runs

## Resources

- [OpenCode Documentation](https://github.com/sst/opencode)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [NodeTool AGENTS.md](/AGENTS.md)
- [Memory System](/.github/opencode-memory/README.md)

---

**Last Updated**: 2026-01-12

**Maintainers**: NodeTool Development Team + OpenCode Agents
