# ⚡ Bolt: FloatingToolBar Performance Optimization

## 💡 What
Modified `web/src/components/panels/FloatingToolBar.tsx` to stop subscribing to the full `nodes` and `edges` arrays from the Zustand store.

## 🎯 Why
The `FloatingToolBar` component was re-rendering on every single node drag or position update because it subscribed to `state.nodes` and `state.edges`. Since `nodes` are immutable arrays, any change (even position updates during dragging) creates a new array reference, triggering a re-render of the toolbar.

This caused unnecessary main thread work during high-frequency interactions like dragging nodes, potentially contributing to UI lag.

## 📊 Impact
- **Reduces re-renders:** `FloatingToolBar` now only re-renders when:
  - The workflow becomes empty or non-empty (`nodes.length === 0 && edges.length === 0`).
  - The workflow metadata changes (e.g., name).
  - It does **NOT** re-render when nodes are moved, resized, or when their data changes.
- **Improved Responsiveness:** Frees up React reconciliation cycles during drag operations.

## 🔬 Measurement
The optimization replaced:
```typescript
const { nodes, edges } = useNodes((state) => ({ nodes: state.nodes, edges: state.edges }));
```
with:
```typescript
const nodeStore = useNodeStoreRef();
const isEmptyWorkflow = useNodes((state) => state.nodes.length === 0 && state.edges.length === 0);

// In handleRun callback:
const { nodes, edges } = nodeStore.getState();
```

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `make lint`: Passed for web package.
- Ran `make test`: Passed for web package (294 tests passed).
