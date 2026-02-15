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

# ⚡ Bolt: Inspector Performance Optimization

## 💡 What
Modified `web/src/components/Inspector.tsx` to use a custom equality function and a simplified selector for `selectedNodes`.

## 🎯 Why
The `Inspector` component subscribed to `state.nodes.filter((node) => node.selected)`. This returns a new array of `Node` objects on every store update. Crucially, when a node is dragged, its `position` updates, creating a new `Node` object. This caused `Inspector` (and its children) to re-render on every frame of a drag operation, even though the Inspector doesn't display or use the node's position.

## 📊 Impact
- **Reduces re-renders:** `Inspector` now only re-renders when the `id`, `type`, or `data` of selected nodes changes. It ignores position updates.
- **Improved Responsiveness:** Frees up main thread during node dragging, especially when the Inspector is open.

## 🔬 Measurement
The optimization replaced:
```typescript
const selectedNodes = useNodes((state) => state.nodes.filter((node) => node.selected));
```
with:
```typescript
const selectedNodes = useNodes(
  (state) =>
    state.nodes
      .filter((node) => node.selected)
      .map((node) => ({ id: node.id, type: node.type, data: node.data })),
  isEqual
);
```
Using `lodash/isEqual` ensures that we only update when the simplified objects (id, type, data) actually change content-wise. Since `node.data` reference is preserved during position updates in `NodeStore`, `isEqual` is efficient.

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `make lint`: Passed.
- Ran `make test`: All 305 tests passed.

# ⚡ Bolt: NodeEditor Shortcuts & History Performance Optimization

## 💡 What
Optimized `web/src/hooks/useNodeEditorShortcuts.ts` and `web/src/components/node_editor/NodeEditor.tsx`.

1. **useNodeEditorShortcuts**: Replaced subscription to `state.getSelectedNodes()` with `state.getSelectedNodeCount()`. Used `useNodeStoreRef()` to access selected nodes imperatively within callbacks.
2. **NodeEditor**: Replaced subscription to entire temporal history state with specific `{ undo, redo }` functions.

## 🎯 Why
- `useNodeEditorShortcuts` was subscribing to `getSelectedNodes()`, which returns a new array of Node objects whenever any node property (including position) changes. This caused `NodeEditor` (which uses this hook) to re-render on **every frame** of a drag operation.
- `NodeEditor` was subscribing to the full temporal state, causing it to re-render whenever the history stack changed (e.g., on drag end).
- `CommandMenu` was receiving new `undo`/`redo` function references on every render, breaking its memoization.

## 📊 Impact
- **Eliminates re-renders during drag:** `NodeEditor` no longer re-renders while dragging nodes, as `useNodeEditorShortcuts` only listens to `count` (stable during drag).
- **Reduces re-renders on history change:** `NodeEditor` only re-renders if `undo`/`redo` functions change (which is rare/never), instead of every history update.
- **Stabilizes CommandMenu:** `CommandMenu` props are now stable, preventing unnecessary re-renders.

## 🔬 Measurement
The optimization in `useNodeEditorShortcuts.ts` replaced:
```typescript
const nodesStore = useNodes((state) => ({
  selectedNodes: state.getSelectedNodes(),
  // ...
}));
```
with:
```typescript
const nodesStore = useNodes((state) => ({
  selectedNodeCount: state.getSelectedNodeCount(),
  // ...
}));
// And using nodeStore.getState().getSelectedNodes() in callbacks
```

And in `NodeEditor.tsx`:
```typescript
const nodeHistory = useTemporalNodes((state) => state);
```
with:
```typescript
const { undo, redo } = useTemporalNodes((state) => ({
  undo: state.undo,
  redo: state.redo
}));
```

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `make lint`: Passed (web).
- Ran `make test`: Passed (web).
