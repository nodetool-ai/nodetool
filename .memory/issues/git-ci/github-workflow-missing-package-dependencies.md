### GitHub Workflow Missing Package Dependencies (2026-01-10)

**Issue**: Some GitHub workflow files only install dependencies for web and electron packages, missing mobile package dependencies.

**Root Cause**: Workflow files like `e2e.yml` and `copilot-setup-steps.yml` didn't include steps to install mobile package dependencies.

**Solution**: Updated workflows to install dependencies in all package directories:
```yaml
- name: Install mobile dependencies
  run: |
    cd mobile
    npm ci
```

**Files Modified**:
- `.github/workflows/e2e.yml` - Added mobile dependency installation and updated path filters
- `.github/workflows/copilot-setup-steps.yml` - Added mobile dependency installation

**Prevention**: When adding new workflows that need npm dependencies, ensure all three packages (web, electron, mobile) have their dependencies installed. Also ensure path filters include `mobile/**` if mobile changes should trigger the workflow.
