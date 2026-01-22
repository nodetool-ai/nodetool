# Quality Check Fixes (2026-01-22)

**Problem**: Multiple lint warnings for unused code:
- TableActions.tsx: unused `handleExportJSON` function
- NodePlacementStore.test.ts: unused `NodePlacementSource` import
- RecentNodesStore.test.ts: unused `RecentNode` import

**Solution**: Removed unused function and unused imports from the affected files.

**Files**:
- web/src/components/node/DataTable/TableActions.tsx
- web/src/stores/__tests__/NodePlacementStore.test.ts
- web/src/stores/__tests__/RecentNodesStore.test.ts

**Date**: 2026-01-22
