## 2026-02-17 - Optimizing Log Subscriptions with Zustand
**Learning:** Zustand's default selector equality is strict equality (`===`). If a selector returns a new reference (like `array.filter()` does), the component will re-render on EVERY store update, even if the data content is identical. This is O(N) re-renders for N components.
**Action:** Use `useStoreWithEqualityFn` (from `zustand/traditional`) with `shallow` equality (from `zustand/shallow`) when selecting derived arrays or objects to prevent unnecessary re-renders.

## 2026-02-17 - Optimizing NodeExplorer Drag Performance
**Learning:** Components subscribing to `state.nodes` re-render on every drag frame because ReactFlow updates the `nodes` array reference and node object references (for position updates). Components that only display node data (like `NodeExplorer`) but not position suffer from excessive re-renders.
**Action:** Use `useNodes` with a custom equality function that checks for structural equality of `id`, `type`, and referential equality of `data`, ignoring `position` and other volatile fields. This effectively decouples the component from drag updates.

## 2024-05-24 - Zustand store usage in hooks
**Learning:** When using selectors that return primitive values calculated from large arrays (`state.edges.filter(...).length`), the component still re-renders if the array reference changes (which it does on every edge update) even if the primitive value remains the same, UNLESS you provide a custom equality function or ensure the state being selected doesn't change reference unnecessarily.
**Action:** In hooks like `useNodeEditorShortcuts`, avoid selecting derived scalar values from volatile arrays without an equality function or better yet, avoid the subscription if the value can be computed imperatively when needed.
