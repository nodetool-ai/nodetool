# ⚡ Bolt: NodeStore `getSelectedNodes` `O(N)` Selection Optimization

## 💡 What
Implemented an internal reference cache for the `getSelectedNodes` getter function in `web/src/stores/NodeStore.ts`, similar to the existing cache for `getSelectedNodeCount`.

## 🎯 Why
The `getSelectedNodes` function is used throughout the application via `useNodes((state) => state.getSelectedNodes())`. Previously, it called `.filter()` on the entire `nodes` array every time it was evaluated. Since Zustand evaluates selector functions on *every* store update (which can be 60fps during dragging a node in ReactFlow), this `O(N)` operation was unnecessarily recalculated even when the nodes had not changed.

## 📊 Impact
- Eliminates redundant `O(N)` array filtering during high-frequency events like React Flow dragging.
- Reduces main thread CPU usage.
- Improves UI smoothness during graph interactions.

## 🔬 Measurement
Ensure tests and type checks pass. Review the React Profiler to verify that components subscribing to `getSelectedNodes` do not trigger expensive derived state re-computations when dragging unrelated nodes.

## 🧪 Testing
- `make typecheck`
- `make lint`
- `make test`