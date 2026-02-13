# ⚡ Bolt: NodeEditor Drag Performance Optimization

## 💡 What
Modified `web/src/components/node_editor/NodeEditor.tsx` and `web/src/components/node_editor/SelectionActionToolbar.tsx` to stop subscribing to the `nodes` array or derived arrays (via `filter`) that change on every position update.

## 🎯 Why
The `NodeEditor` component subscribed to `state.getSelectedNodes()`, which returns a new array on every store update (even if selection is stable, if nodes move).
The `SelectionActionToolbar` subscribed to `state.nodes.filter(...)`, which also returns a new array on every store update (e.g., during drag).
This caused unnecessary re-renders of the entire editor and toolbar on every frame of a drag operation, consuming main thread resources.

## 📊 Impact
- **Reduces re-renders:** `NodeEditor` and `SelectionActionToolbar` now only re-render when the *set of selected node IDs* changes (or the count changes for toolbar), not when their positions change.
- **Improved Responsiveness:** Frees up React reconciliation cycles during drag operations, making the UI smoother.

## 🔬 Measurement
The optimization replaced:
```typescript
// In NodeEditor.tsx
const selectedNodes = useNodes((state) => state.getSelectedNodes());
```
with:
```typescript
// Uses IDs (stable strings) instead of node objects (mutable)
const selectedNodeIds = useNodes((state) => state.getSelectedNodeIds());
```

And in `SelectionActionToolbar.tsx`:
```typescript
const selectedNodes = useNodes((state) => state.nodes.filter((node) => node.selected));
```
with:
```typescript
// Uses count (number) which is stable during drag
const selectedCount = useNodes((state) => state.getSelectedNodeCount());
```

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `make lint`: Passed for web package.
- Attempted `make test`: Encountered pre-existing environment failures in `FlexColumn.tsx`, but updated `SelectionActionToolbar.test.tsx` to align with changes.
