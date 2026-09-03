## 2026-10-25 - O(N*M) lookup optimization in Sketch layer tools
**Learning:** Nested array `.find(...)` inside loops over selected target IDs created an O(N*M) bottleneck in tools like `TransformTool.ts` and `useTransformActions.ts`.
**Action:** Replace nested `.find(...)` inside loops with an O(N) backward/forward scan against a `Set` of target IDs, which is much faster than `Map` setup (avoids N temporary object allocations) and correctly implements the optimization requested without memory regressions.
