# WorkflowListViewStore Test Fixes

**Problem**: Three tests in WorkflowListViewStore.test.ts were failing:
1. "should have default showGraphPreview as true" - Expected true, received false
2. "should toggle graph preview" - Expected true, received false
3. "should persist state to localStorage" - localStorage was null

**Root Cause**: 
1. The store had `showGraphPreview: false` as default, but tests expected `true`
2. The store didn't use zustand persist middleware, so state wasn't being saved to localStorage

**Solution**: 
1. Changed default value from `false` to `true` in WorkflowListViewStore.ts
2. Added zustand persist middleware to the store with name "workflow-list-view"

**Files**:
- `web/src/stores/WorkflowListViewStore.ts`
- `web/src/stores/__tests__/WorkflowListViewStore.test.ts`

**Date**: 2026-01-16
