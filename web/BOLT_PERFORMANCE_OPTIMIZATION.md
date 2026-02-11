# ⚡ Bolt: NodeEditor Drag Performance Optimization

## 💡 What
Optimized `NodeEditor` and `SelectionActionToolbar` components to subscribe to specific properties (`selectedNodeIds` and `selectedNodeCount`) instead of the entire `selectedNodes` array.

## 🎯 Why
Previously, `NodeEditor` subscribed to `selectedNodes` using `state.getSelectedNodes()`. This function creates a new array every time it's called.
Although `useNodes` uses shallow comparison, dragging a selected node updates its position in the store, creating a new node object.
This caused `selectedNodes` to change (different node object ref), causing `NodeEditor` (and all its children) to re-render on every drag frame (60fps).

Similarly, `SelectionActionToolbar` was filtering `state.nodes` directly in the selector, creating a new array on every store update (drag), causing it to re-render.

## 📊 Impact
- **Eliminates `NodeEditor` re-renders during drag:** `NodeEditor` now only re-renders when the *list of selected IDs* changes, not when a selected node moves.
- **Eliminates `SelectionActionToolbar` re-renders during drag:** It now only checks the *count* of selected nodes, which is stable during drag.
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
And in `SelectionActionToolbar`:
```typescript
const selectedNodes = useNodes((state) => state.nodes.filter((node) => node.selected));
```
with:
```typescript
const selectedCount = useNodes((state) => state.getSelectedNodeCount());
```

## 🧪 Testing
- Ran `make typecheck`: Passed for web.
- Ran `make lint`: Passed for web.
- Ran `npm test src/components/node_editor/__tests__/SelectionActionToolbar.test.tsx`: Passed (updated mock).
- Ran performance tests: Passed.
