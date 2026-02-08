# ⚡ Bolt: Optimized NodeOutput Rendering

## 💡 What
Optimized `NodeOutput` component to prevent unnecessary re-renders when dragging connections.

1.  **Selective State Subscription**: `NodeOutput` now uses a custom selector with `useConnectionStore(selector, isEqual)` to subscribe only to relevant connection state changes.
2.  **Derived State Logic**: Moved `isConnectable` and `classConnectable` logic inside the selector. This ensures the component *only* re-renders when the derived connectability status actually changes for that specific output, rather than on every drag movement or connection start.
3.  **Removed Redundant Fallbacks**: Removed `useNodes`, `useMetadataStore`, and `findInputHandle` hooks from the component, as the `effectiveConnectType` fallback logic was redundant (the store's `connectType` is reliable).

## 🎯 Why
Previously, `NodeOutput` subscribed to `connectNodeId`, `connectHandleId`, `connectType`, and `connectDirection` individually. When a user started dragging a connection:
1.  All 4 values changed in the store.
2.  **Every** `NodeOutput` in the graph re-rendered to check if it was compatible with the dragged connection.
3.  This caused O(N) re-renders (where N = total outputs) on drag start and drag end.

With the optimization:
-   **Incompatible outputs**: Still re-render once to update their class to `not-connectable`.
-   **Compatible outputs**: Do **not** re-render if their state remains `is-connectable` (which is the default).
-   **Source output**: Does **not** re-render if it stays `is-connectable`.

For a graph with many compatible nodes (e.g. many String outputs), this significantly reduces render churn during interaction.

## 📊 Impact
*   **Reduces re-renders**: From O(Total Outputs) to O(Incompatible Outputs) on drag start.
*   **Reduced Hook Overhead**: Removed 3 hooks (`useNodes`, `useMetadataStore`, `useMemo` for fallback) per component instance.
*   **Smoother Interaction**: Less main thread blocking when starting to drag a wire in large graphs.

## 🔬 Measurement
Verify by adding `console.log` in `NodeOutput` and dragging a connection.
-   **Before**: Logs appear for *every* output on the screen.
-   **After**: Logs only appear for outputs that actually change their visual state (e.g. from "connectable" to "not-connectable"). Compatible outputs will NOT log.

## 🧪 Testing
*   `make typecheck`: Passed (web).
*   `make lint`: Passed (web).
*   `make test-web`: Passed.
    *   Fixed `useConnectionHandlers.test.ts` which was failing due to missing mocks.
*   Manual verification of logic via code review confirms behavior is preserved.
