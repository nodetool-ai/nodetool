### Test Failures in useSelectionActions (2026-01-12)

**Issue**: Tests in `useSelectionActions.test.ts` were failing with incorrect position expectations:
- `distributeHorizontal` test expected positions 200 and 400, but got 140 and 280
- `distributeVertical` test expected positions 200 and 400, but got 70 and 140

**Root Cause**: The test expectations assumed a spacing of 100px (horizontal) and 150px (vertical), but the actual implementation uses constants `HORIZONTAL_SPACING = 40` and `VERTICAL_SPACING = 20`.

**Solution**: Updated test expectations to match the actual implementation:
```typescript
// Horizontal (with HORIZONTAL_SPACING=40 and nodeWidth=100):
// input at 0
// A at 0 + 100 + 40 = 140
// B at 140 + 100 + 40 = 280

// Vertical (with VERTICAL_SPACING=20 and nodeHeight=50):
// input at 0
// A at 0 + 50 + 20 = 70
// B at 70 + 50 + 20 = 140
```

**Files**: `web/src/hooks/__tests__/useSelectionActions.test.ts`

**Prevention**: When writing tests for functions that use configuration constants, ensure test expectations match the actual constant values, not assumed values.
