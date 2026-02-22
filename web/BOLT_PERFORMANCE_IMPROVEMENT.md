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

# ⚡ Bolt: NodeExplorer Performance Optimization

## 💡 What
Modified `web/src/components/node/NodeExplorer.tsx` to use a custom equality function for `useNodes` subscription.

## 🎯 Why
The `NodeExplorer` component subscribed to `state.nodes`, which is an array that is recreated on every node position update (drag). This caused `NodeExplorer` to re-render on every frame of a drag operation, even though it only displays node metadata (title, type) which does not change during drag.
Given that `NodeExplorer` processes the entire node list (sorting, filtering), these redundant re-renders were expensive.

## 📊 Impact
- **Eliminates unnecessary re-renders:** `NodeExplorer` now only re-renders when node `id`, `type`, or `data` reference changes. It completely ignores position updates.
- **Improved Responsiveness:** Improves UI fluidity during drag operations, especially with large numbers of nodes.

## 🔬 Measurement
The optimization replaced the default `shallow` equality (which fails on new array reference) with a custom `areNodesEqual` function that:
1. Checks array length.
2. Iterates nodes and checks `id`, `type`, and `data` reference.
3. Ignores `position`, `selected`, etc.

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `make lint`: Passed.
- Ran `make test`: All 327 tests passed.
