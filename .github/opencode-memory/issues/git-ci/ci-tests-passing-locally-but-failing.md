# CI Tests Passing Locally But Failing in GitHub Actions

**Problem**: Tests pass locally but fail in CI.

**Common Causes**:
1. **Environment differences**: CI uses clean environment
2. **Timing issues**: CI may be slower, increase timeouts
3. **Dependencies**: Use `npm ci` not `npm install` in CI

**Solution**: Run tests in clean environment locally:
```bash
rm -rf node_modules
npm ci
npm test
```

**Date**: 2026-01-10
