# ⚡ Bolt: NodeEditor Drag Performance Optimization

## 💡 What
Optimized `NodeEditor` component to subscribe to `selectedNodeIds` instead of the entire `selectedNodes` array.

## 🎯 Why
Previously, `NodeEditor` subscribed to `selectedNodes` using `state.getSelectedNodes()`. This function creates a new array of node objects every time it's called.
Since `useNodes` uses shallow comparison, and dragging a node updates its position (creating a new object reference), dragging a selected node caused `selectedNodes` to change (different object references), causing `NodeEditor` (and all its children) to re-render on every drag frame.

By switching to `selectedNodeIds` (array of strings), the value remains shallowly equal during drag (IDs don't change), preventing unnecessary re-renders.

**Note:** An optimization for `SelectionActionToolbar` was also attempted but reverted due to E2E test instability. The toolbar still re-renders on drag, but since `NodeEditor` (the parent) no longer re-renders, the overall performance gain is significant.

## 📊 Impact
- **Eliminates `NodeEditor` re-renders during drag:** `NodeEditor` now only re-renders when the *list of selected IDs* changes, not when a selected node moves.
- **Smoother UX:** Frees up main thread during drag operations, especially with many nodes.

## 🔬 Measurement
The optimization replaced:
```typescript
const selectedNodes = useNodes((state) => state.getSelectedNodes());
```
with:
```typescript
const selectedNodeIds = useNodes((state) => state.getSelectedNodeIds());
```

## 🧪 Testing
- Ran `make typecheck`: Passed for web.
- Ran `make lint`: Passed for web.
- Ran `npm test src/components/node_editor/__tests__/SelectionActionToolbar.test.tsx`: Passed.
- Verified that `getSelectedNodeIds` is available in `NodeStore`.
