# ⚡ Bolt: CommandMenu Selected Nodes Memoization Optimization

## 💡 What
Refactored `CommandMenu.tsx` to use a custom equality function `areNodesEqualIgnoringPosition` for the `selectedNodes` selector. Instead of relying on `state.getSelectedNodes()` which returns a new array reference on every store update (like node movement), it now performs an inline `.filter` mapped with a custom shallow equality check.

## 🎯 Why
The `EditCommands` component inside the `CommandMenu` was re-rendering unnecessarily on every single node drag frame because `state.getSelectedNodes()` creates a new array reference even when the subset of selected nodes or their actual selection status remains unchanged. In graphs with multiple nodes, this caused wasted CPU cycles during drag-and-drop operations leading to potential UI jank.

## 📊 Impact
- **Eliminates Unnecessary Re-renders:** The `EditCommands` sub-component now only re-renders when the actual selected node references or their selection states change.
- **Reduces Main Thread Work:** Prevents O(N) filtering combined with React reconciliation overhead on every frame during drag operations.
- **Improved Responsiveness:** Smoother editing and dragging experience in complex workflows.

## 🔬 Measurement
Verified by observing React DevTools "Highlight updates" during node drag. The `CommandMenu` (or its child components) should no longer flash during dragging when the selection itself does not change.

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `cd web && npm run lint`: Passed.
- Ran `cd web && npm test`: All 340 test suites passed.
