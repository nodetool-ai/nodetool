# OpenCode Quality Guardrails

## Overview

Quality guardrails have been added to all OpenCode workflows to prevent introducing code quality issues (type errors, lint errors, test failures) into the codebase.

## How It Works

### 1. Pre-Flight Check (Before Agent Runs)

Before the OpenCode agent starts working:
- Runs `make typecheck`, `make lint`, and `make test`
- Records the baseline quality state
- Informs the agent about any pre-existing issues
- Provides context in the workflow summary

### 2. Agent Instructions

OpenCode agents receive explicit instructions to:
- Run `make lint-fix` first to auto-fix lint issues
- Check quality frequently during development
- Ensure `make check` passes before completing work
- Not introduce NEW quality issues
- Optionally fix existing issues if related to their task

### 3. Post-Change Verification (After Agent Completes)

After the OpenCode agent finishes:
- Runs quality checks again
- Compares results to pre-flight baseline
- **Fails the workflow** if NEW issues were introduced
- Provides detailed error reports in workflow summary
- Adds comments to the PR/issue on failure

## Quality Gate Rules

✅ **PASS**: No new errors introduced
- If codebase was clean, it stays clean
- If codebase had errors, no additional errors added
- Bonus: Agent fixed some existing errors

❌ **FAIL**: New errors introduced
- TypeScript errors that weren't there before
- Lint errors that weren't there before  
- Test failures that weren't there before

## Workflow Changes

All OpenCode workflows now include:

1. **Pre-flight quality check step** (before OpenCode agent)
2. **Enhanced prompt with quality requirements**
3. **Post-change verification step** (after OpenCode agent)
4. **Automatic failure on quality degradation**
5. **Detailed error reporting in summaries**

Affected workflows:
- `opencode.yml` (manual trigger)
- `opencode-features.yaml` (scheduled)
- `opencode-hourly-improve.yaml` (scheduled)
- `opencode-hourly-test.yaml` (scheduled)
- `opencode-accessibility.yaml` (scheduled)
- `opencode-coverage.yaml` (scheduled)
- `opencode-docs-quality.yaml` (scheduled)
- `opencode-performance.yaml` (scheduled)
- `opencode-research.yaml` (scheduled)
- `opencode-security-audit.yaml` (scheduled)

## For OpenCode Agents

### Required Steps

1. **Start with auto-fix**:
   ```bash
   make lint-fix
   ```

2. **Check quality before committing**:
   ```bash
   make typecheck  # Must exit 0
   make lint       # Must exit 0
   make test       # Must exit 0
   ```

3. **Or use combined check**:
   ```bash
   make check  # Runs all three
   ```

### Debugging Failures

If quality checks fail:

1. **TypeScript errors**: Fix type issues manually
   ```bash
   make typecheck
   # Review errors and fix them
   ```

2. **Lint errors**: Auto-fix first, then manual
   ```bash
   make lint-fix  # Auto-fix many issues
   make lint      # Check remaining
   ```

3. **Test failures**: Debug and fix
   ```bash
   make test
   # Review failures and fix them
   ```

## For Developers

### Viewing Results

Quality check results appear in:
- **Workflow Summary**: Detailed pass/fail status with error counts
- **Workflow Logs**: Full output of each check
- **PR/Issue Comments**: Automatic comment on failure (for manual triggers)

### Bypassing (NOT RECOMMENDED)

Quality gates cannot be bypassed. If an agent's changes fail quality checks, the workflow fails. This is intentional to maintain code quality.

### Fixing Pre-Existing Issues

Pre-existing issues don't fail the workflow, but agents are encouraged to fix them:
- Check the "Pre-Flight Quality Check" in workflow summary
- See which errors existed before agent started
- Agent can fix these as part of their work

## Monitoring

### Workflow Status

Check workflow runs in GitHub Actions:
1. Go to repository → Actions tab
2. Select an OpenCode workflow
3. View run details and quality check steps

### Quality Trends

Track quality over time:
- Compare pre-flight vs post-change results
- Monitor if agents are improving or maintaining quality
- Review failed runs to understand common issues

## Configuration

### Quality Check Script

Location: `.github/scripts/quality-check.sh`

This reusable script:
- Runs all three quality checks
- Logs results to files
- Stores exit codes in GitHub environment
- Provides consistent output format

### Reusable Workflows

Location: `.github/workflows/quality-checks.yml`

Can be called from other workflows:
```yaml
jobs:
  quality:
    uses: ./.github/workflows/quality-checks.yml
    with:
      fail-fast: true
      skip-tests: false
```

## Benefits

### For Users
- **Fewer bugs**: Catches issues before merging
- **Stable experience**: Prevents regressions
- **Faster fixes**: Issues caught early

### For Developers  
- **Clean codebase**: Maintains quality standards
- **Clear feedback**: Know exactly what to fix
- **Automated enforcement**: No manual review needed for basic quality

### For AI Agents
- **Clear requirements**: Know what's expected
- **Immediate feedback**: See results right away
- **Learn from failures**: Understand what went wrong

## Examples

### Successful Run

```
✅ Pre-Flight Quality Check
   TypeScript: PASSED
   ESLint: PASSED
   Tests: PASSED

[Agent makes changes]

✅ Post-Change Verification
   TypeScript: PASSED
   ESLint: PASSED
   Tests: PASSED

✅ All quality checks passed!
```

### Failed Run (New Errors)

```
✅ Pre-Flight Quality Check
   TypeScript: PASSED
   ESLint: PASSED
   Tests: PASSED

[Agent makes changes]

❌ Post-Change Verification
   TypeScript: FAILED (3 errors)
   ESLint: FAILED (5 errors)
   Tests: PASSED

🔴 NEW TypeScript errors introduced!
🔴 NEW lint errors introduced!
❌ QUALITY GATE FAILED
```

### Improved Run (Fixed Existing Errors)

```
⚠️ Pre-Flight Quality Check
   TypeScript: FAILED (5 errors)
   ESLint: FAILED (10 errors)
   Tests: PASSED

[Agent makes changes]

⚠️ Post-Change Verification
   TypeScript: FAILED (2 errors) [Improved!]
   ESLint: PASSED [Fixed!]
   Tests: PASSED

✅ Quality improved (no new errors, some fixed)
```

## Troubleshooting

### Workflow Fails Immediately

**Issue**: Pre-flight check fails and workflow stops

**Solution**: This is expected behavior. Pre-existing issues are documented but don't stop the workflow. Check the logs for details.

### Agent Can't Fix Issues

**Issue**: Agent completes but quality check fails

**Solution**: 
1. Review error logs in workflow summary
2. Manually fix issues in a new commit
3. Or re-run workflow with corrected approach

### False Positives

**Issue**: Workflow fails but errors seem unrelated

**Solution**:
1. Check if errors existed before (pre-flight check)
2. Review diff to confirm changes caused issues
3. File an issue if you believe it's a false positive

## Future Enhancements

Potential improvements:
- Incremental checks (only changed files)
- Severity-based gating (fail on errors, warn on warnings)
- Auto-fix commits pushed automatically
- Quality metrics dashboard
- Historical quality tracking

## Resources

- [Build, Test, and Lint Requirements](../opencode-memory/build-test-lint.md)
- [Makefile Commands](/Makefile)
- [Testing Guide](/web/TESTING.md)
- [OpenCode Workflows README](../workflows/README.md)

---

**Last Updated**: 2026-01-17

**Maintainer**: NodeTool Development Team
