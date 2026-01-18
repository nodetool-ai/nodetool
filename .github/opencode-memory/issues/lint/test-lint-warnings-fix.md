# Lint Warnings in Test Files Fix

**Problem**: 10 lint warnings about unused variables in test files across the codebase.

**Solution**: Fixed by:
1. Renaming unused variables to prefixed with `_` (e.g., `_selectedNodes`)
2. Removing unused imports (e.g., `NamespaceTree`, `act`, `Workflow`)
3. Renaming unused caught error variables to `_e`

**Files**:
- web/src/hooks/__tests__/useDuplicate.test.ts
- web/src/hooks/__tests__/useNamespaceTree.test.ts
- web/src/hooks/__tests__/useNumberInput.test.ts
- web/src/stores/__tests__/ConnectableNodesStore.test.ts
- web/src/stores/__tests__/WorkflowActionsStore.test.ts
- web/src/utils/__tests__/downloadPreviewAssets.test.ts

**Date**: 2026-01-18
