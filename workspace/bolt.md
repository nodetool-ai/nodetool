## 2025-03-08 - Batching node deletions to bypass O(N) Zustand churn
**Learning:** Found an iterative Zustand action invocation (`deleteNode`) mapping over an array in `SelectionContextMenu.tsx`. For every iteration, `deleteNode` would wrap its own internal call to `deleteNodes([id])` resulting in redundant re-evaluations and subsequent component renders.
**Action:** Always favor bulk/batch updates (`deleteNodes(selectedIds)`) over iterative individual state mutations inside React arrays/maps, especially on `Zustand` state managers where state changes instantly dispatch updates to all subscribed hooks.

## 2025-03-08 - Optimizing Node Selection in NodeStore
**Learning:** `setSelectedNodes`, `selectNodesByType` and `selectAllNodes` in `web/src/stores/NodeStore.ts` were calling `get().nodes.map()` and indiscriminately spreading objects to update their `selected` property, resulting in unnecessary new object allocations and array regeneration even when nothing changed, which triggered React re-renders.
**Action:** Implemented a pattern where updates to state arrays only return new objects when actual modifications are needed. Added an `if (changed)` check to bypass the `set()` call completely if the state array is untouched, drastically cutting down on Zustand churn and unnecessary re-renders.
