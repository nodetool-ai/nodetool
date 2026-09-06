## 2026-10-25 - O(N*M) lookup optimization in Sketch layer tools
**Learning:** Nested array `.find(...)` inside loops over selected target IDs created an O(N*M) bottleneck in tools like `TransformTool.ts` and `useTransformActions.ts`.
**Action:** Replace nested `.find(...)` inside loops with an O(N) backward/forward scan against a `Set` of target IDs, which is much faster than `Map` setup (avoids N temporary object allocations) and correctly implements the optimization requested without memory regressions.
## 2024-09-04 - Avoid flatMap object keys in large arrays
**Learning:** Using `[...new Set(array.flatMap(obj => Object.keys(obj)))]` creates massive intermediate array allocations and performance bottlenecks.
**Action:** Use a manual `for` loop to iterate over the objects and their keys, adding each directly to a single `Set`.
## 2024-11-20 - O(N*M) array filtering inside metric calculations
**Learning:** Multiple array `.filter(...).length` statements create O(N*M) performance bottlenecks and intermediate array allocations when calculating totals or counts.
**Action:** Replace multiple `.filter(...).length` lines with a single manual `for` loop that iterates the array once and tallies multiple metrics concurrently (O(N) pass, O(1) space).
