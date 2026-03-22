# ⚡ Bolt: BaseNode Edge Lookup Optimization

## 💡 What
Refactored `BaseNode.tsx` to use a custom memoized selector `hasConnectedInputSelector` and `hasControlEdgeSelector` for `useNodes` when determining if a node has connected edges or control edges.
Instead of evaluating the O(E) filter logic `.some(...)` on every store update inside the selector (which runs 60 times a second on all nodes during drag operations), the selector now maintains an internal cache. The expensive `.some(...)` check is only executed when the actual `state.edges` array reference changes.
Furthermore, the selectors return primitive boolean values, ensuring the component only re-renders when its specific connection state changes, rather than when any unrelated edge updates.

## 🎯 Why
`BaseNode` is rendered for every node on the workflow graph.
Previously, every instance of `BaseNode` evaluated `state.edges.some(...)` on *every* `NodeStore` state change. Because React Flow updates the `nodes` array reference on every frame during drag operations (60fps), this caused N instances of `BaseNode` to loop over E edges 60 times a second.
For large graphs, this meant O(N*E) operations per frame on the main thread, leading to significant UI jank. Returning primitive values prevents unnecessary re-renders when unrelated edges are added or removed, a regression introduced in early optimization attempts.

## 📊 Impact
- **Eliminates Unnecessary Computations:** Reduces O(N*E) array iterations per drag frame to O(1) selector executions and zero `.some(...)` operations.
- **Improved Drag Smoothness:** Frees up main thread time for React Flow to handle drag updates more smoothly, especially in large graphs.
- **Prevents Unnecessary Re-renders:** Component maintains exact render parity with before by tracking primitive booleans while minimizing evaluation overhead.

## 🔬 Measurement
Verify by checking React Profiler during node drag operations. Total scripting time per frame is drastically reduced compared to evaluating all edges constantly.

## 🧪 Testing
- Ran `cd web && npm test` to verify changes did not break existing Node logic.
- Ran `cd web && npm run typecheck` and `npm run lint`.
