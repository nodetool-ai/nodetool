# ⚡ Bolt: Node Property Connection Optimization II

## 💡 What
Optimized edge connection checks in `CollectionProperty.tsx`, `StringProperty.tsx`, and `PlaceholderNode.tsx` to prevent unnecessary component re-renders and excessive main thread work during graph interactions.

Specifically:
1. Replaced direct `state.edges` subscriptions in `CollectionProperty` and `StringProperty` with the `useIsConnectedSelector` hook, which uses a memoized closure to cache the boolean result.
2. Replaced `const edges = useNodes((n) => n.edges)` in `PlaceholderNode` with a custom memoized selector that returns only a list of incoming `targetHandle` strings, using a deep equality check before returning a new array reference.

## 🎯 Why
Previously, these components subscribed to the entire `state.edges` array from the `NodeStore`.
Because React Flow generates a new array reference for `edges` whenever *any* connection in the graph is modified (e.g., adding/removing/updating an edge anywhere in the graph), these components would re-render even if the edge changes were completely unrelated to them.
Worse, in the case of `PlaceholderNode`, it performed an O(E) filter operation (`edges.filter`) on every render, which gets extremely expensive for graphs with hundreds of edges.

## 📊 Impact
- **Eliminates O(N*E) Computations:** Prevents O(E) filter iterations per component instance (N) whenever the graph updates.
- **Prevents Unnecessary Re-renders:** These property components and placeholder nodes will now strictly re-render ONLY when their specific incoming edges change.
- **Improved Drag & Edit Smoothness:** Frees up main thread time for smoother graph interactions, especially in large workflows.

## 🔬 Measurement
Verify by checking React DevTools Profiler. Adding a new edge between two unrelated nodes will no longer cause `CollectionProperty`, `StringProperty`, or `PlaceholderNode` instances across the rest of the graph to re-render.

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `cd web && npm run lint`: Passed.
- Ran `make test-web`: All test suites passed.
