# UseInputNodeAutoRun Test Fixes

**Problem**: Tests failed with "TypeError: (0 , NodeContext_1.useNodeStoreRef) is not a function" because the mock for NodeContext only included `useNodes` but not `useNodeStoreRef` which is also imported and used by the hook.

**Solution**: 
1. Added `useNodeStoreRef` to the NodeContext mock
2. Added import for `useNodeStoreRef` from the mock
3. Created `mockUseNodeStoreRef` mock variable
4. Added mock setup in `beforeEach` to return a store with `getState()` containing `nodes`, `edges`, `workflow`, and `findNode`

**Files**:
- web/src/hooks/nodes/__tests__/useInputNodeAutoRun.test.ts

**Date**: 2026-01-19
