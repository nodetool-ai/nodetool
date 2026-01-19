# useInputNodeAutoRun Test Mock Fix

**Problem**: Three tests in `useInputNodeAutoRun.test.ts` were failing because the mock setup only configured `mockUseNodes` but not `mockUseNodeStoreRef`. The hook uses `useNodeStoreRef()` to get the current node state via `getState()`, but the tests weren't mocking this correctly.

**Solution**: Added missing `mockUseNodeStoreRef` mock setup to three test cases:
1. "injects cached values for all external dependencies in subgraph when instantUpdate is enabled"
2. "handles multiple external dependencies to different nodes in subgraph when instantUpdate is enabled"  
3. "falls back to input/constant node values when cached results are missing and instantUpdate is enabled"

**Files**: web/src/hooks/nodes/__tests__/useInputNodeAutoRun.test.ts

**Date**: 2026-01-19
