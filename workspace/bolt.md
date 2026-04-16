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

## 2024-03-08 - Zustand Default Equality for useNodes
**Learning:** `useNodes` uses strict equality (`===`) by default, not shallow equality, as assumed in early designs. When optimizing multiple primitive `.some()` selectors into a single compound selector (e.g., returning `{ hasChildren, someChildrenBypassed }` to halve `O(N)` loop iterations during drag frames), simply returning an object literal will create a new reference on every call and trigger an infinite re-render loop that bricks the app.
**Action:** When combining primitives into a compound object in `useNodes`, wrap the selector in `useMemo` and use a closure variable (like `lastResult = ...`) to cache the specific object reference. Only return a newly created object if the internal primitive values actually changed.

## 2024-05-24 - Zustand useNodes array filtering edge cases
**Learning:** Using `useNodes((state) => ({ edges: state.edges }), shallow)` to subscribe to the full edges array in a Node component, and then performing `.filter()` to find connected edges later, still causes the Node component to re-render on *any* edge change in the graph because the `state.edges` reference changes.
**Action:** Create a custom selector hook with `useMemo` that performs the filtering internally and explicitly deep-checks the filtered array items (`lastResult.every((edge, i) => edge === newResult[i])`) to return a perfectly stable array reference when the filtered items haven't changed.

## 2026-03-22 - React Array Deduplication Complexity
**Learning:** Deduplicating arrays inside React state setters using `reduce` and `findIndex` (e.g., `acc.findIndex(item => item.id === current.id) === -1`) creates an O(N²) time complexity bottleneck. As the array grows (like a stream of real-time notifications or logs), each new item requires a full scan of the accumulator, which can block the main thread and cause UI stuttering during high-frequency updates.
**Action:** Always use an O(N) approach for array deduplication, such as maintaining a `Set` of unique identifiers (e.g., `seenIds = new Set()`) and a single `for...of` loop to build the new array.
## 2024-05-24 - NodeStore `getSelectedNodeCount` `O(N)` Selection Optimization
**Learning:** Functions exposed on the Zustand `store.getState()` (like `getSelectedNodeCount`) that compute derived state (`O(N)`) are extremely dangerous when subscribed to directly inside a component's `useNodes` hook (e.g. `const count = useNodes((state) => state.getSelectedNodeCount())`). Because Zustand evaluates selector functions on *every* store update (which is 60fps during dragging), an `O(N)` getter becomes `O(K * N)` per frame when `K` components subscribe to it.
**Action:** When creating derived getters on a Zustand store, either use memoized selectors that components can consume or add a lightweight internal cache (`lastNodesForSelectionCount === get().nodes`) inside the getter itself so it only computes the `O(N)` operation once per state reference update.

## 2026-04-12 - High-Frequency State Arrays `findLastIndex` Optimization
**Learning:** During high-frequency streaming events (like LLM token generation) where an array in a Zustand store is continuously appended to and updated, using `array.findIndex()` to locate the message creates an O(N²) bottleneck because it scans from the beginning.
**Action:** Always use `array.findLastIndex()` or an O(1) Map lookup for finding elements in an array when updated elements are appended to the end to prevent blocking the main thread.

## 2025-01-31 - CommandMenu Zustand Selector Optimization
**Learning:** Returning an object literal from a primitive Zustand selector in `useNodes` (e.g., `(state) => ({ nodes: state.nodes, edges: state.edges })`) defaults to strict equality (`===`), causing continuous re-renders whenever the underlying arrays are updated (e.g., at 60fps during ReactFlow dragging).
**Action:** Always provide `shallow` from `zustand/shallow` as the second argument to `useNodes` when returning new object literals containing shallowly comparable elements to eliminate unnecessary `O(N)` re-renders.

## 2024-04-14 - Zustand useNodes Compound Selectors Performance
**Learning:** Using `useNodes` with object literal returns (e.g. `useNodes((state) => ({ x: state.x, y: state.y }))`) defaults to strict equality (`===`), causing continuous re-renders whenever the underlying arrays are updated (e.g., at 60fps during ReactFlow dragging). Even if the returned values inside the object don't change, the new object literal reference forces a re-render.
**Action:** Always provide `shallow` from `zustand/shallow` as the second argument to `useNodes` when returning new object literals containing shallowly comparable elements to eliminate unnecessary `O(N)` re-renders. Added `shallow` equality to all instances of compound selectors in `useNodes` across the codebase.
