# Test File Import Path Fixes

**Problem**: Several test files had incorrect import paths for `NodeData` type, causing TypeScript errors.

**Solution**: Fixed import paths from `../stores/NodeData` to `../../stores/NodeData` in test files.

**Files**:
- `web/src/hooks/__tests__/useAlignNodes.test.ts`
- `web/src/hooks/__tests__/useFitView.test.ts`

**Date**: 2026-01-16
