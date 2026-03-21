# FavoriteWorkflowsStore Test Fixes

**Problem**: TypeScript errors and test failures in FavoriteWorkflowsStore.test.ts due to incorrect access pattern. Tests were using `.actions.toggleFavorite()` but the store doesn't have an `actions` property - methods are directly on the state object.

**Solution**: Removed `.actions` prefix from all method calls in tests, changing:
- `useFavoriteWorkflowsStore.getState().actions.toggleFavorite("workflow-1")`
to:
- `useFavoriteWorkflowsStore.getState().toggleFavorite("workflow-1")`

**Files**:
- web/src/stores/__tests__/FavoriteWorkflowsStore.test.ts

**Date**: 2026-01-19
