
## 2025-03-08 - Batching node deletions to bypass O(N) Zustand churn
**Learning:** Found an iterative Zustand action invocation (`deleteNode`) mapping over an array in `SelectionContextMenu.tsx`. For every iteration, `deleteNode` would wrap its own internal call to `deleteNodes([id])` resulting in redundant re-evaluations and subsequent component renders.
**Action:** Always favor bulk/batch updates (`deleteNodes(selectedIds)`) over iterative individual state mutations inside React arrays/maps, especially on `Zustand` state managers where state changes instantly dispatch updates to all subscribed hooks.
