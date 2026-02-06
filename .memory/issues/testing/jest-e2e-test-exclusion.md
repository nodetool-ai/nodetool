### Jest E2E Test Exclusion (2026-01-12)

**Issue**: E2E tests (Playwright) were being loaded by Jest despite `testPathIgnorePatterns` configuration, causing "TransformStream is not defined" errors.

**Root Cause**: The `testPathIgnorePatterns` pattern `/tests/e2e/` had a leading slash, but Jest uses relative paths without leading slashes. The actual test paths matched `tests/e2e/` (without leading slash).

**Solution**: Changed the pattern in `jest.config.ts` from:
```javascript
testPathIgnorePatterns: ["/node_modules/", "/dist/", "/tests/e2e/"]
```
to:
```javascript
testPathIgnorePatterns: ["/node_modules/", "/dist/", "tests/e2e/"]
```

**Files Modified**: `web/jest.config.ts`

**Prevention**: When excluding test paths in Jest, use patterns without leading slashes for relative paths.

**Date**: 2026-01-12
