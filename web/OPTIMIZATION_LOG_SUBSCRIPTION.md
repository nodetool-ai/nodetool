# ⚡ Bolt: Optimize NodeHeader and NodeLogs re-renders

## 💡 What
Optimized `NodeHeader` and `NodeLogs` components to use `shallow` equality check when subscribing to `LogStore`.
Instead of calling `state.getLogs(...)` which returns a new array reference on every store update, we now select the filtered logs inline and use `shallow` comparison.

## 🎯 Why
Previously, every time a log was appended to the `LogStore` (for ANY node), `state.getLogs` would run for EVERY `NodeHeader` (and `NodeLogs`).
Because `filter` returns a new array reference, every `NodeHeader` component would re-render, even if the logs for that specific node hadn't changed.
In a workflow with many nodes (N) and frequent log updates, this caused O(N) re-renders per log, leading to main thread blocking and UI lag.

## 📊 Impact
- **Reduces re-renders by ~99%** (for N=100 nodes) during log heavy operations.
- `NodeHeader` only re-renders when logs for *its* specific node change.
- `NodeLogs` only re-renders when logs for *its* specific node change.

## 🔬 Measurement
A performance regression test was added in `web/src/__tests__/performance/LogStoreReRender.test.tsx`.
It verifies that:
1. Adding a log for Node A does NOT trigger a re-render for Node B's component.
2. Adding a log for Node A DOES trigger a re-render for Node A's component.

## 🧪 Testing
Ran `make test-web`.
Verified `src/__tests__/performance/LogStoreReRender.test.tsx` passes.
Verified existing tests pass.
