## 2026-05-25 - O(N*M) Edge Filtering Bottleneck
**Learning:** In `GroupNode.tsx` and `graph.ts`, nested `Array.find()` and `Array.some()` inside `Array.filter()` loops on edges and group nodes created an O(N*M) operation, severely degrading performance for large workflows when dragging groups or computing graphs.
**Action:** Always convert the target search array into a `Set` of IDs (O(N) creation) and use `Set.has()` inside the loop (O(1) lookup), reducing the complexity to O(N+M).
