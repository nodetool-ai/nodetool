### Pre-commit Hooks Failing

**Issue**: Git commit fails due to husky pre-commit hooks.

**Solution**: Fix lint/type errors first:
```bash
make lint-fix
make typecheck
```

Or skip hooks (not recommended):
```bash
git commit --no-verify
```
