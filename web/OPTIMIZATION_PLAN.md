# ⚡ Bolt: NodeStore Serialization Optimization

## 💡 What
Optimized the `getWorkflow` function in `web/src/stores/NodeStore.ts` by inlining helper functions.
Previously, `unconnectedProperties` and `isHandleConnected` were defined inside `getWorkflow` and called for every property of every node.
These helper functions were replaced with inline logic that directly utilizes the pre-calculated `connectedHandles` set for O(1) lookups.

## 🎯 Why
`getWorkflow` is called frequently during auto-save and manual saves.
The previous implementation involved creating closures and making multiple function calls for each property of every node in the graph.
Inlining this logic eliminates function call overhead and closure allocation, streamlining the property filtering loop.
While the asymptotic complexity remains O(N*M) (where N is nodes and M is properties), the constant factor is reduced, which is beneficial for large graphs with many properties.

## 📊 Impact
- **Reduced Overhead:** Eliminates function call overhead for every single property check during serialization.
- **Cleaner Code:** Simplifies the logic by removing nested helper functions.

## 🔬 Measurement
Benchmark the `getWorkflow()` method with a large graph (100+ nodes) before and after the change.

## 🧪 Testing
- Verify that `getWorkflow` correctly identifies unconnected properties and produces the expected JSON output.
- Run existing tests in `web/src/stores/__tests__/NodeStore.test.ts`.
