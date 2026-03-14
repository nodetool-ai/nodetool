## 2026-02-17 - Optimizing Log Subscriptions with Zustand
**Learning:** Zustand's default selector equality is strict equality (`===`). If a selector returns a new reference (like `array.filter()` does), the component will re-render on EVERY store update, even if the data content is identical. This is O(N) re-renders for N components.
**Action:** Use `useStoreWithEqualityFn` (from `zustand/traditional`) with `shallow` equality (from `zustand/shallow`) when selecting derived arrays or objects to prevent unnecessary re-renders.

## 2026-02-17 - Optimizing NodeExplorer Drag Performance
**Learning:** Components subscribing to `state.nodes` re-render on every drag frame because ReactFlow updates the `nodes` array reference and node object references (for position updates). Components that only display node data (like `NodeExplorer`) but not position suffer from excessive re-renders.
**Action:** Use `useNodes` with a custom equality function that checks for structural equality of `id`, `type`, and referential equality of `data`, ignoring `position` and other volatile fields. This effectively decouples the component from drag updates.
## 2024-03-07 - Zustand Selector Optimization
**Learning:** Returning objects with a `useCallback` inside `useNodes` evaluates every render and reallocates memory, limiting selector cache utility. The correct pattern is wrapping an internal selector definition in `useMemo` so that the closure variables (e.g. `lastEdges`) are preserved across renders.
**Action:** Use `useMemo` with an inner closure for custom memoized selectors in Zustand stores instead of `useCallback` when trying to cache values between store state changes.
## 2024-03-07 - Zustand Selector Optimization returning object literals
**Learning:** Even if `useMemo` caches the closure of a Zustand selector properly, if the selector returns an object literal like `{ isConnected, stringInputConfig }`, Zustand's default strict equality (`===`) will cause an infinite re-render loop if the object identity changes on every call, leading to canvas freezing (like `.react-flow` timing out in Playwright).
**Action:** When returning objects from custom Zustand selectors, cache the entire returned object literal inside the selector closure (e.g. `let lastResult = ...`) and only return a new object reference if the underlying primitive values actually changed. Alternatively, pass `shallow` as the equality function.
## 2024-05-24 - Zustand useNodes array filtering edge cases
**Learning:** Using `useNodes((state) => ({ edges: state.edges }), shallow)` to subscribe to the full edges array in a Node component, and then performing `.filter()` to find connected edges later, still causes the Node component to re-render on *any* edge change in the graph because the `state.edges` reference changes.
**Action:** Create a custom selector hook with `useMemo` that performs the filtering internally and explicitly deep-checks the filtered array items (`lastResult.every((edge, i) => edge === newResult[i])`) to return a perfectly stable array reference when the filtered items haven't changed.
