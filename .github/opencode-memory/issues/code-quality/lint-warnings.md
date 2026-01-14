# Lint Warnings in ViewportStatusIndicator

**Problem**: Unused variables `nodeCount`, `selectedCount`, and `useNodes` in `ViewportStatusIndicator.tsx`, and unused variable in test file.

**Solution**: 
- Removed unused imports and variables from `ViewportStatusIndicator.tsx`
- Fixed lint warning in `NodeExecutionTime.test.tsx` by prefixing unused variable with underscore and adding curly braces
- Updated `ViewportStatusIndicator.test.tsx` to use `renderWithTheme` helper

**Files**:
- `web/src/components/node_editor/ViewportStatusIndicator.tsx`
- `web/src/components/node/__tests__/NodeExecutionTime.test.tsx`
- `web/src/components/node_editor/__tests__/ViewportStatusIndicator.test.tsx`

**Date**: 2026-01-14
