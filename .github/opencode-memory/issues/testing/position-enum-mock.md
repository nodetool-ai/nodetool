# Position Enum Mock Issue

**Problem**: Tests using `Position.Left` and `Position.Right` from `@xyflow/react` failed when the module was mocked, as the Position enum became undefined.

**Solution**: Cast string literals to `any` type for test mock nodes: `"left" as any`.

**Files**:
- `web/src/hooks/__tests__/useAlignNodes.test.ts`
- `web/src/hooks/__tests__/useFitView.test.ts`

**Date**: 2026-01-16
