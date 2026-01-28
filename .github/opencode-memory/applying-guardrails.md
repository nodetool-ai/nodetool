# Applying Quality Guardrails to OpenCode Workflows

This guide shows how to apply the quality guardrails pattern to any OpenCode workflow.

## Overview

Quality guardrails prevent OpenCode agents from introducing type errors, lint errors, or test failures. The pattern consists of three parts:

1. **Pre-flight check** (before agent runs)
2. **Enhanced prompt** (instructions for agent)
3. **Post-change verification** (after agent completes)

## Step-by-Step Application

### 1. Add Mobile Dependencies Installation

After the existing dependency installation steps, add:

```yaml
- name: Install mobile dependencies
  run: |
    cd mobile
    npm ci
```

### 2. Add Pre-Flight Check Step

After dependency installation and before the "Run OpenCode" step, add:

```yaml
- name: Pre-flight Quality Check
  id: pre-check
  continue-on-error: true
  run: |
    echo "## 🔍 Pre-Flight Quality Check" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "Checking current codebase quality before OpenCode agent runs..." >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    
    TYPECHECK_EXIT=0
    LINT_EXIT=0
    TEST_EXIT=0
    
    echo "### TypeScript Type Check" >> $GITHUB_STEP_SUMMARY
    if make typecheck 2>&1 | tee typecheck-pre.log; then
      echo "✅ No TypeScript errors" >> $GITHUB_STEP_SUMMARY
    else
      TYPECHECK_EXIT=1
      ERROR_COUNT=$(grep -c "error TS" typecheck-pre.log || echo "0")
      echo "⚠️ Found $ERROR_COUNT TypeScript error(s)" >> $GITHUB_STEP_SUMMARY
    fi
    
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### ESLint Check" >> $GITHUB_STEP_SUMMARY
    if make lint 2>&1 | tee lint-pre.log; then
      echo "✅ No lint errors" >> $GITHUB_STEP_SUMMARY
    else
      LINT_EXIT=1
      ERROR_COUNT=$(grep -c "error" lint-pre.log || echo "0")
      WARNING_COUNT=$(grep -c "warning" lint-pre.log || echo "0")
      echo "⚠️ Found $ERROR_COUNT error(s) and $WARNING_COUNT warning(s)" >> $GITHUB_STEP_SUMMARY
    fi
    
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### Test Suite" >> $GITHUB_STEP_SUMMARY
    if make test 2>&1 | tee test-pre.log; then
      echo "✅ All tests passing" >> $GITHUB_STEP_SUMMARY
    else
      TEST_EXIT=1
      echo "⚠️ Some tests failing" >> $GITHUB_STEP_SUMMARY
    fi
    
    echo "" >> $GITHUB_STEP_SUMMARY
    
    # Store results for OpenCode agent
    echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
    echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
    echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV
    
    if [ $TYPECHECK_EXIT -ne 0 ] || [ $LINT_EXIT -ne 0 ] || [ $TEST_EXIT -ne 0 ]; then
      echo "---" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo "⚠️ **Pre-existing quality issues detected.**" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo "The OpenCode agent will be informed and should:" >> $GITHUB_STEP_SUMMARY
      echo "- Not introduce NEW errors" >> $GITHUB_STEP_SUMMARY
      echo "- Consider fixing existing errors if relevant" >> $GITHUB_STEP_SUMMARY
      echo "- Run \`make lint-fix\` to auto-fix lint issues" >> $GITHUB_STEP_SUMMARY
      echo "- Run \`make check\` before completing work" >> $GITHUB_STEP_SUMMARY
    else
      echo "✅ **Codebase quality is clean!**" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo "OpenCode agent must maintain this quality standard." >> $GITHUB_STEP_SUMMARY
    fi
```

### 3. Enhance the Prompt

In the OpenCode prompt, after the project context and before the main instructions, add this section:

```yaml
## ⚠️ CRITICAL: Quality Guardrails (MANDATORY)

**BEFORE YOU START**: The workflow has run pre-flight quality checks.
- Check the "Pre-Flight Quality Check" step results above
- Pre-existing issues: TypeCheck=$TYPECHECK_PRE_EXIT, Lint=$LINT_PRE_EXIT, Test=$TEST_PRE_EXIT
- Exit code 0 = passing, non-zero = failing

**REQUIRED STEPS FOR EVERY CHANGE**:

1. **Auto-fix lint issues first**:
   ```bash
   make lint-fix  # Auto-fix many lint issues
   ```

2. **Verify quality checks pass**:
   ```bash
   make typecheck  # Must exit 0
   make lint       # Must exit 0  
   make test       # Must exit 0
   ```

3. **Fix any errors**:
   - TypeScript errors: Fix type issues manually
   - Lint errors: Run `make lint-fix` first, then fix remaining manually
   - Test failures: Debug and fix failing tests

4. **Re-run checks until all pass**:
   ```bash
   make check  # Runs all three checks
   ```

**QUALITY GATE RULES**:
- ✅ If codebase was clean (all exit 0), it MUST stay clean
- ⚠️ If codebase had errors, you MUST NOT introduce NEW errors
- 🎯 Bonus: Fix existing errors if related to your work
- 🚫 NEVER commit code that breaks type checking, linting, or tests

**WORKFLOW WILL FAIL** if you don't meet these requirements!
```

### 4. Add Post-Change Verification

At the end of the workflow, after the "Run OpenCode" step, add:

```yaml
- name: Post-change Quality Verification
  if: always()
  id: post-check
  run: |
    echo "## 🔍 Post-Change Quality Verification" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "Verifying quality after OpenCode agent completed..." >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    
    TYPECHECK_EXIT=0
    LINT_EXIT=0
    TEST_EXIT=0
    
    echo "### TypeScript Type Check" >> $GITHUB_STEP_SUMMARY
    if make typecheck 2>&1 | tee typecheck-post.log; then
      echo "✅ No TypeScript errors" >> $GITHUB_STEP_SUMMARY
    else
      TYPECHECK_EXIT=1
      ERROR_COUNT=$(grep -c "error TS" typecheck-post.log || echo "0")
      echo "❌ Found $ERROR_COUNT TypeScript error(s)" >> $GITHUB_STEP_SUMMARY
      echo "<details><summary>View Errors</summary>" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo '```' >> $GITHUB_STEP_SUMMARY
      tail -50 typecheck-post.log >> $GITHUB_STEP_SUMMARY
      echo '```' >> $GITHUB_STEP_SUMMARY
      echo "</details>" >> $GITHUB_STEP_SUMMARY
    fi
    
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### ESLint Check" >> $GITHUB_STEP_SUMMARY
    if make lint 2>&1 | tee lint-post.log; then
      echo "✅ No lint errors" >> $GITHUB_STEP_SUMMARY
    else
      LINT_EXIT=1
      ERROR_COUNT=$(grep -c "error" lint-post.log || echo "0")
      WARNING_COUNT=$(grep -c "warning" lint-post.log || echo "0")
      echo "❌ Found $ERROR_COUNT error(s) and $WARNING_COUNT warning(s)" >> $GITHUB_STEP_SUMMARY
      echo "<details><summary>View Errors</summary>" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo '```' >> $GITHUB_STEP_SUMMARY
      tail -50 lint-post.log >> $GITHUB_STEP_SUMMARY
      echo '```' >> $GITHUB_STEP_SUMMARY
      echo "</details>" >> $GITHUB_STEP_SUMMARY
    fi
    
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### Test Suite" >> $GITHUB_STEP_SUMMARY
    if make test 2>&1 | tee test-post.log; then
      echo "✅ All tests passing" >> $GITHUB_STEP_SUMMARY
    else
      TEST_EXIT=1
      echo "❌ Some tests failing" >> $GITHUB_STEP_SUMMARY
      echo "<details><summary>View Failures</summary>" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo '```' >> $GITHUB_STEP_SUMMARY
      tail -50 test-post.log >> $GITHUB_STEP_SUMMARY
      echo '```' >> $GITHUB_STEP_SUMMARY
      echo "</details>" >> $GITHUB_STEP_SUMMARY
    fi
    
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "---" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    
    # Compare with pre-check
    QUALITY_DEGRADED=false
    
    if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
      echo "🔴 **NEW TypeScript errors introduced!**" >> $GITHUB_STEP_SUMMARY
      QUALITY_DEGRADED=true
    fi
    
    if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
      echo "🔴 **NEW lint errors introduced!**" >> $GITHUB_STEP_SUMMARY
      QUALITY_DEGRADED=true
    fi
    
    if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
      echo "🔴 **NEW test failures introduced!**" >> $GITHUB_STEP_SUMMARY
      QUALITY_DEGRADED=true
    fi
    
    if [ "$QUALITY_DEGRADED" = true ]; then
      echo "" >> $GITHUB_STEP_SUMMARY
      echo "❌ **QUALITY GATE FAILED: Code quality degraded!**" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo "The changes introduced NEW quality issues." >> $GITHUB_STEP_SUMMARY
      echo "Please fix these issues before merging." >> $GITHUB_STEP_SUMMARY
      exit 1
    elif [ $TYPECHECK_EXIT -ne 0 ] || [ $LINT_EXIT -ne 0 ] || [ $TEST_EXIT -ne 0 ]; then
      echo "⚠️ **Quality issues remain (but no new ones introduced)**" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo "Consider fixing these pre-existing issues." >> $GITHUB_STEP_SUMMARY
    else
      echo "✅ **ALL QUALITY CHECKS PASSED!**" >> $GITHUB_STEP_SUMMARY
      echo "" >> $GITHUB_STEP_SUMMARY
      echo "Code is ready for review." >> $GITHUB_STEP_SUMMARY
    fi
```

## Workflows That Need Updates

Apply this pattern to all OpenCode workflows:

- [x] `opencode.yml` - ✅ Done
- [x] `opencode-hourly-test.yaml` - ✅ Done
- [ ] `opencode-features.yaml`
- [ ] `opencode-hourly-improve.yaml`
- [ ] `opencode-accessibility.yaml`
- [ ] `opencode-coverage.yaml`
- [ ] `opencode-docs-quality.yaml`
- [ ] `opencode-performance.yaml`
- [ ] `opencode-research.yaml`
- [ ] `opencode-security-audit.yaml`

## Workflow-Specific Customizations

### For Quality/Test Workflows
(like `opencode-hourly-test.yaml`)

Change the message to emphasize fixing issues:
```yaml
echo "The OpenCode agent should focus on FIXING these issues!" >> $GITHUB_STEP_SUMMARY
```

### For Feature Workflows
(like `opencode-features.yaml`)

Keep the standard message:
```yaml
echo "The OpenCode agent will be informed and should:" >> $GITHUB_STEP_SUMMARY
echo "- Not introduce NEW errors" >> $GITHUB_STEP_SUMMARY
```

### For Security Workflows
(like `opencode-security-audit.yaml`)

Add additional context about security:
```yaml
echo "Security fixes must maintain code quality!" >> $GITHUB_STEP_SUMMARY
```

## Testing the Changes

After applying the pattern:

1. **Create a test branch**: Don't apply directly to main workflows
2. **Trigger manually**: Use `workflow_dispatch` if available
3. **Review the summary**: Check if all three sections appear correctly
4. **Verify failure handling**: Test with intentionally broken code
5. **Merge when confirmed**: Only then apply to production workflows

## Troubleshooting

### Workflow runs but checks don't show
- Verify the step IDs are correct (`pre-check`, `post-check`)
- Check that `$GITHUB_STEP_SUMMARY` is available
- Review GitHub Actions logs for script errors

### False positives
- Compare pre-flight and post-change logs
- Check if errors existed before agent ran
- Review the exit code comparisons

### Workflow always fails
- Check if `continue-on-error: true` is set for pre-flight check
- Verify `if: always()` is set for post-change check
- Review the comparison logic

## Benefits of This Pattern

1. **Prevents regressions**: New errors caught immediately
2. **Clear feedback**: Agents know exactly what went wrong
3. **Automated enforcement**: No manual review needed
4. **Encourages fixes**: Agents can improve existing quality
5. **Transparent process**: Full visibility in workflow summaries

## See Also

- [Quality Guardrails Documentation](./quality-guardrails.md)
- [Build, Test, and Lint Requirements](./build-test-lint.md)
- [Workflow README](../workflows/README.md)

---

**Last Updated**: 2026-01-17
