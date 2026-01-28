# FavoriteWorkflowsStore Test Fixes

**Problem**: Tests in `FavoriteWorkflowsStore.test.ts` were using incorrect API accessing methods via `.actions` property which doesn't exist on the store.

**Solution**: Removed `.actions` property access since store methods are directly on the state object.

**Files**: web/src/stores/__tests__/FavoriteWorkflowsStore.test.ts

**Date**: 2026-01-19
