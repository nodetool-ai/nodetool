# Test Flaky Timing Fix

**Problem**: ExecutionTimeStore.test.ts had a flaky test that sometimes failed due to timing precision issues. The test expected exactly 2500ms but could get 2501ms due to the order of operations.

**Solution**: Fixed the test by setting up Date.now mock before calling startExecution, ensuring consistent timing:

```typescript
// Before (❌ Flaky)
startExecution("workflow1", "node1");
const startTime = Date.now();
jest.spyOn(Date, "now").mockImplementation(() => startTime + 2500);

// After (✅ Reliable)
const startTime = 1000;
jest.spyOn(Date, "now").mockImplementation(() => startTime);
startExecution("workflow1", "node1");

jest.spyOn(Date, "now").mockImplementation(() => startTime + 2500);
endExecution("workflow1", "node1");
```

**Files**:
- `web/src/stores/__tests__/ExecutionTimeStore.test.ts`

**Date**: 2026-01-14
