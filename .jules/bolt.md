## 2024-05-18 - Concurrent workflow bundle export

**Learning:** `Promise.all` can significantly improve the performance of loading multiple workflows for a bundle export, reducing the time complexity from O(N) IO latency to O(1) IO latency.
**Action:** Replaced a sequential `for` loop that called `loadBundledWorkflow` with `Promise.all` mapping over the array of workflow IDs in `packages/websocket/src/http-api.ts`.
