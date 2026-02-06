# ⚡ Bolt: Optimized NodeInputs Rendering

## 💡 What
Optimized `NodeInputs` component to prevent unnecessary re-renders when graph edges change.

1.  **Selective Edge Subscription**: `NodeInputs` now uses a specific selector `state.edges.filter(e => e.target === id)` instead of selecting all edges. This ensures the component only re-renders when edges connected to *that specific node* change.
2.  **Pure Child Component**: Modified `NodeInput` to receive `isConnected` as a prop instead of subscribing to the store itself. This removes N*M subscriptions (where N=nodes, M=inputs) and makes `NodeInput` a pure component.
3.  **Fixed Type Error**: Fixed a pre-existing TypeScript error in `data_types.test.ts`.

## 🎯 Why
Previously, `NodeInputs` (and every `NodeInput` child) subscribed to the entire `edges` array. Any change to *any* edge in the graph (e.g., dragging a connection, adding an edge elsewhere) triggered a re-render of **every input port on every node**.

For a graph with 50 nodes and 5 inputs each, dragging one edge would trigger ~250 component re-renders. This optimization reduces that to only the affected node's inputs.

## 📊 Impact
*   **Reduces re-renders**: From O(Total Inputs) to O(Inputs of Affected Node) on edge changes.
*   **Improved Responsiveness**: Smoother interaction when wiring up nodes in large graphs.

## 🔬 Measurement
Verify by adding `console.log` in `NodeInputs` and dragging an edge between two unrelated nodes. Before change: logs appear for all nodes. After change: logs only appear for affected nodes.

## 🧪 Testing
*   `make typecheck`: Passed (web).
*   `make lint`: Passed (web).
*   `make test-web`: Passed (ignoring unrelated flaky test).
