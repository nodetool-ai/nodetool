# ⚡ Bolt: getSelection and getSelectedNodeIds caching

**💡 What:**
Implemented a lightweight internal reference cache for `getSelectedNodeIds` and `getSelection` within the `NodeStore`.

**🎯 Why:**
`getSelectedNodeIds` is an `O(N)` operation, and `getSelection` is an `O(N + E)` operation. Both recalculate the currently selected nodes (and edges) using full array iteration/filtering on every call. Because multiple components (and potentially React hooks like `useNodes`) access these getters constantly (especially at 60fps during ReactFlow dragging), they cause significant unneeded processing on the main thread. Caching results by checking structural reference equality (`nodes === lastNodesForSelectionIds` and `nodes === lastNodesForGetSelection && edges === lastEdgesForGetSelection`) guarantees that the computation is skipped unless the relevant arrays have actually changed references.

**📊 Impact:**
- CPU overhead and main thread blocking are greatly reduced during heavy graph updates, like node dragging.
- Extends the `lastNodesForSelectionCount` optimization to the remaining selection-based getters.

**🔬 Measurement:**
Use a performance profiler (e.g. Chrome DevTools) during React Flow drag interactions with a large graph (e.g. 50+ nodes/edges) and observe decreased script evaluation times.

**🧪 Testing:**
- `cd web && npm run test`
- `cd web && npm run typecheck`
- `cd web && npm run lint`
Tested manually with existing `NodeStore.test.ts`.
