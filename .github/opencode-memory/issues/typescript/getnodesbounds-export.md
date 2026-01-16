# getNodesBounds Export

**Problem**: Test file `useFitView.test.ts` imported `getNodesBounds` from `useFitView.ts` but it wasn't exported.

**Solution**: Changed function declaration from `function getNodesBounds(...)` to `export function getNodesBounds(...)`.

**Files**:
- `web/src/hooks/useFitView.ts`
- `web/src/hooks/__tests__/useFitView.test.ts`

**Date**: 2026-01-16
