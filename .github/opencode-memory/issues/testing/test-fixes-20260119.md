# Test Fixes for Quality Checks (2026-01-19)

**Problem**: Multiple test failures and TypeScript errors in quality checks.

**Solution**: Fixed 3 test files:
1. `FavoriteWorkflowsStore.test.ts` - Removed `.actions` from store state access (methods are directly on state, not under actions object)
2. `formatDateAndTime.test.ts` - Updated test expectations to match actual implementation (uses "sec" instead of "second", "min" instead of "minute")
3. `useAutosave.test.ts` - Added mock workflow node with required `sync_mode` field and at least one node to pass `isWorkflowEmpty` check

**Files**:
- web/src/stores/__tests__/FavoriteWorkflowsStore.test.ts
- web/src/utils/__tests__/formatDateAndTime.test.ts
- web/src/hooks/__tests__/useAutosave.test.ts
- web/src/hooks/nodes/useSurroundWithGroup.ts (lint warning fix)

**Date**: 2026-01-19
