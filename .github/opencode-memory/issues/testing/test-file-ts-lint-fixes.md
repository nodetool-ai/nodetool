# Test File TypeScript and Lint Fixes

**Problem**: Multiple test files had TypeScript errors and ESLint violations preventing quality checks from passing.

**Issues Fixed**:
1. `useAlignNodes.test.ts`: Wrong import path for NodeData, default export imported as named import, wrong import path, `require()` imports forbidden by ESLint
2. `useFitView.test.ts`: Wrong import path for NodeData, `getNodesBounds` function not exported, `require()` imports forbidden by ESLint
3. `useFocusPan.test.ts`: `require()` imports forbidden by ESLint
4. `useAutosave.test.ts`: Mock return type missing required fields, unused variables

**Solution**:
- Fixed NodeData import paths from `../stores/NodeData` to `../../stores/NodeData` (tests are in `__tests__` subfolder)
- Changed `import { useAlignNodes }` to `import useAlignNodes` (default export)
- Added `export` keyword to `getNodesBounds` function in `useFitView.ts`
- Rewrote test mocks using proper Jest patterns with `mockImplementation` instead of `require()`
- Added missing fields to workflow mock in useAutosave.test.ts
- Removed unused `waitFor` import and unused `result` variable

**Files**:
- `web/src/hooks/__tests__/useAlignNodes.test.ts`
- `web/src/hooks/__tests__/useFitView.test.ts`
- `web/src/hooks/__tests__/useFocusPan.test.ts`
- `web/src/hooks/__tests__/useAutosave.test.ts`
- `web/src/hooks/useFitView.ts`

**Date**: 2026-01-16
