# ⚡ Bolt: Node Property Connection Status Performance Optimization (StringProperty & CollectionProperty)

## 💡 What
Rolled out `useIsConnectedSelector` (from `web/src/hooks/nodes/useIsConnected.ts`) to additional node property components: `StringProperty.tsx` and `CollectionProperty.tsx`.
This replaces inline `.some()` edge lookups and custom inline memoized selectors with a standard, memoized Zustand selector that caches the previous `state.edges` array reference.

## 🎯 Why
Previously, any node property component that needed to check if it had an incoming edge (to hide/show the input field) would evaluate `state.edges.some(...)` on every Zustand state update.
Because React Flow updates the node/edge state on every frame during drag operations (60fps), this caused N properties to loop over E edges 60 times a second, even when the edges themselves hadn't changed.
By standardizing on `useIsConnectedSelector`, we ensure consistent, optimal performance across all node properties. `CollectionProperty` was previously evaluating all edges on every store update, while `StringProperty` had a verbose, custom inline implementation.

## 📊 Impact
- **Eliminates Unnecessary Computations:** Reduces O(N*E) array iterations per drag frame to O(1) selector executions when edges are unmodified for `CollectionProperty`.
- **Code Standardization:** Replaces duplicate inline memoization logic in `StringProperty` with the shared, tested `useIsConnectedSelector`.
- **Improved Responsiveness:** Frees up main thread time for smoother graph interactions.

## 🔬 Measurement
Verify by checking React Profiler during node drag operations. Total scripting time per frame is reduced compared to evaluating all edges constantly. The `CollectionProperty` specifically will no longer trigger unnecessary edge iterations on unrelated graph changes.

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `cd web && npm run lint`: Passed.
- Ran `make test-web`: All tests passed.