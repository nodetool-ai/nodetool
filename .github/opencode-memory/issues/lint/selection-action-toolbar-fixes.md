# SelectionActionToolbar Code Quality Fixes

**Problem**: TypeScript type errors in tests and lint warnings in component.

**Issues Fixed**:
1. Unused import `Info` from @mui/icons-material
2. Unnecessary `selectedNodes.length` dependency in useMemo (redundant with `canGroup`)
3. Tests passing non-existent `onToggleNodeInfo` prop to component

**Files**:
- `web/src/components/node_editor/SelectionActionToolbar.tsx`
- `web/src/components/node_editor/__tests__/SelectionActionToolbar.test.tsx`

**Date**: 2026-01-13
