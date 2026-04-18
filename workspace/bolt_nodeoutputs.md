# ⚡ Bolt: NodeOutputs Subscriptions Optimization

## 💡 What
Optimized the `useNodes` subscription in `web/src/components/node/NodeOutputs.tsx` by replacing the generic `node` lookup with a granular extraction of just `nodeType` and `dynamicOutputs` using `shallow` equality check.

## 🎯 Why
Previously, `NodeOutputs` subscribed to the entire `Node` object via `useNodes((state) => state.findNode(id))`. Because React Flow continuously updates node objects with new positional data on every drag frame (at 60fps), this caused `NodeOutputs` to continuously re-render whenever its parent node was dragged around the canvas, even if its actual outputs or type never changed.

## 📊 Impact
- **Eliminates Unnecessary Re-renders:** The component and all of its nested children will now only re-render when its properties (`nodeType` or `dynamicOutputs`) actually change.
- **Improved Drag Performance:** Reduces the workload on the main thread during node dragging operations.

## 🔬 Measurement
Verify by checking the React Profiler while dragging a node that has multiple outputs. The `NodeOutputs` component will no longer show up as re-rendering during the drag interaction.

## 🧪 Testing
- The modified code has been type-checked correctly. Unrelated type errors were present in the codebase.
- Tests were run via `npm run test:web`. Existing unrelated test failures in `Model3DViewer` were present in the main branch prior to changes. No tests related to `NodeOutputs` broke.
