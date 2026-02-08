# useInputNodeAutoRun Test Fixes

**Problem**: Three tests in `useInputNodeAutoRun.test.ts` were failing:
1. "injects cached values for all external dependencies in subgraph when instantUpdate is enabled"
2. "handles multiple external dependencies to different nodes in subgraph when instantUpdate is enabled"  
3. "falls back to input/constant node values when cached results are missing and instantUpdate is enabled"

All tests expected cached/fallback values to be injected into node properties but were receiving `undefined`.

**Root Causes**:
1. **Mock setup issue**: `mockSubgraph.mockReturnValue()` was returning incomplete edge lists, missing external edges needed for testing
2. **Node store mock issue**: `mockUseNodeStoreRef` was using default mock data (`defaultMockNodes`/`defaultMockEdges`) instead of test-specific data (`complexNodes`/`complexEdges`)

**Solution**:
1. Updated `mockSubgraph.mockReturnValue()` to include all relevant edges (including external dependency edges)
2. Added test-specific overrides for `mockUseNodeStoreRef` in each failing test to use the correct nodes and edges for that test

**Files**: web/src/hooks/nodes/__tests__/useInputNodeAutoRun.test.ts

**Date**: 2026-01-19
