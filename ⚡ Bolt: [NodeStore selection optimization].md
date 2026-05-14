# ⚡ Bolt: NodeStore selection optimization

## 💡 What:
Optimized `setSelectedNodes`, `selectNodesByType` and `selectAllNodes` methods in `web/src/stores/NodeStore.ts` by:
1. Converting `nodes.includes(node)` which is O(N) inside an O(N) loop (thus O(N²)) into a O(1) Set lookup using `const nodesToSelectIds = new Set(nodes.map(n => n.id));`.
2. Avoiding the unconditional allocation of new object instances for each node (`{ ...node, selected: ... }`).
3. Only calling Zustand's `set({ nodes: nextNodes })` if at least one node actually changed its selection state.

## 🎯 Why:
The previous implementation caused massive churn. Every time `setSelectedNodes` (or the others) were called, even if the exact same node was already selected, it recreated the entire `nodes` array with brand new node objects. This causes every connected component (ReactFlow, node inspectors, context menus) to falsely detect a state change, triggering expensive cascading re-renders and re-evaluations throughout the app.

## 📊 Impact:
- **Reduces Re-Renders:** Zero re-renders triggered when selecting already selected nodes.
- **Time Complexity Reduction:** `setSelectedNodes` goes from O(N²) down to O(N).
- **Lower Memory Pressure:** Less GC churn since we skip allocating N new objects per call.

## 🔬 Measurement:
Profile any node selection in ReactFlow (e.g. clicking a node, pressing Cmd+A). Previously, multiple operations (or no-op selections) would yield multiple new states. Now, duplicate or unchanged selection updates short-circuit the `set()` call.

## 🧪 Testing:
Ran `cd web && npm run test -- NodeStore.test.ts` to ensure behavior works correctly. The test suite passes.
