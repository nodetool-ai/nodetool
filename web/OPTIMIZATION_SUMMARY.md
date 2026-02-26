# ⚡ Bolt: Split Edge Processing for Performance

## 💡 What
Refactored `useProcessedEdges` hook to split edge processing into two distinct phases:
1.  **Structural Phase (Heavy):** Computes edge types, gradients, and static styling. Memoized based on graph structure (`edges`, `nodes`, `dataTypes`).
2.  **Status Phase (Light):** Applies execution status updates (animations, counters, `message-sent` class) to the pre-computed structural edges.

## 🎯 Why
During workflow execution, status updates arrive frequently (streaming). Previously, every status update triggered a full re-computation of edge types and gradients (O(N*M) where M is complexity of type resolution).
By splitting the logic, frequent status updates only trigger a lightweight O(N) pass to append classes, while the expensive structural logic is skipped.

## 📊 Impact
- **Reduces Main Thread Work:** significantly reduces CPU time during workflow execution, especially for large graphs.
- **Improved Responsiveness:** UI remains responsive even with high-frequency status updates.
- **Preserves Correctness:** Maintains all visual features (gradients, reroute tracing) and existing optimizations (drag freezing).

## 🔬 Measurement
Verify by running a workflow and observing that `useStructurallyProcessedEdges` (internal hook) is NOT re-executed when only status changes, whereas `useProcessedEdges` (wrapper) updates efficiently.

## 🧪 Testing
Run `npm test src/hooks/__tests__/useProcessedEdges.test.ts` to verify no regressions in functionality.
Type checking passed via `npm run typecheck`.

# ⚡ Bolt: Chat Message List Performance Optimization

## 💡 What
Refactored `web/src/components/chat/thread/ChatThreadView.tsx` to split the monolithic `MemoizedMessageListContent` into two separate memoized components: `MemoizedMessageList` (for the static message history) and `MemoizedStatusFooter` (for dynamic status/progress updates).

## 🎯 Why
During chat streaming and tool execution, `status`, `progress`, and `progressMessage` update frequently (up to 60fps).
Previously, these updates caused the entire message list (including hundreds of `MessageView` components) to be reconciled by React, even though the messages themselves hadn't changed.
This caused high main thread usage during generation, leading to UI jank.

## 📊 Impact
- **Eliminates redundant reconciliations:** `MemoizedMessageList` now only re-renders when the `messages` array actually changes (e.g., new token arrived), completely ignoring status/progress updates.
- **Improved Responsiveness:** Frees up significant main thread time during text generation and tool execution.
- **Stable References:** Ensures expensive message filtering and execution grouping logic runs only when needed.

## 🔬 Measurement
Verify by observing React DevTools "Highlight updates" during a chat response. The message history should NOT flash during the "streaming" phase, only the status footer should update.

## 🧪 Testing
- Created `web/src/components/chat/thread/ChatThreadView.test.tsx` to verify component splitting logic.
- Ran `cd web && npm run typecheck`: Passed.
- Ran `cd web && npm run lint`: Passed.
- Ran `cd web && npm test`: All 331 test suites passed.

# ⚡ Bolt: Inspector and NodeExplorer Performance Optimization

## 💡 What
Refactored `Inspector.tsx` and `NodeExplorer.tsx` to use a custom equality function `areNodesEqualIgnoringPosition` for `useNodes` selectors.
Optimized `edges` selection in `Inspector.tsx` to use strict equality for the array reference and perform filtering inside `useMemo`.

## 🎯 Why
`Inspector` and `NodeExplorer` were subscribing to `state.nodes` with expensive O(N) selectors (map/filter) that ran on every store update (e.g., every drag frame, 60fps).
Even though the components didn't always re-render, the selector logic itself consumed main thread time during drag operations.
Additionally, `edges` filtering in `Inspector` was allocating new arrays on every frame.

## 📊 Impact
- **Reduces Main Thread Work per Frame:** Eliminates O(N) object allocations and deep comparisons in `Inspector` selector during node dragging.
- **Optimizes Edge Filtering:** Reduces O(E) filtering and allocation per frame in `Inspector` to O(1) strict equality check + memoized result.
- **Improved Drag Smoothness:** Frees up CPU time for React Flow to handle drag updates more smoothly.

## 🔬 Measurement
Verify by dragging nodes in a large graph (1000+ nodes). The UI should remain responsive. Profiling shows reduced "Scripting" time during drag.

## 🧪 Testing
- Created `web/src/utils/__tests__/nodeEquality.test.ts` to verify the equality logic.
- Ran `cd web && npm test src/utils/__tests__/nodeEquality.test.ts`: Passed.
- Ran `cd web && npm run typecheck`: Passed.

# ⚡ Bolt: RerouteNode Performance Optimization

## 💡 What
Refactored `RerouteNode.tsx` to use a granular `useNodes` selector.
Instead of subscribing to the entire `state.edges` array (which changes reference on any edge update), it now selects only the specific upstream connection data (`sourceType`, `sourceData`, `sourceHandle`) required to determine the node color.

## 🎯 Why
`RerouteNode` is frequently used in workflows for cleanup.
Previously, every `RerouteNode` instance would re-render whenever *any* edge in the graph was added, removed, or updated (including status/animated edges).
In large graphs with many reroute nodes, this caused significant unnecessary re-renders during editing and execution.

## 📊 Impact
- **Eliminates Unnecessary Re-renders:** `RerouteNode` now only re-renders when its specific upstream connection changes.
- **Reduces Main Thread Work:** Prevents O(N) component re-renders where N is the number of reroute nodes.
- **Improved Responsiveness:** Smoother editing experience in large workflows.

## 🔬 Measurement
Verified using a performance regression test that counts renders of the internal `Handle` component.
- Before: Adding an unrelated edge caused `RerouteNode` to re-render.
- After: Adding an unrelated edge does NOT cause `RerouteNode` to re-render.

## 🧪 Testing
- Created `web/src/components/node/__tests__/RerouteNode.performance.test.tsx` to verify the optimization.
- Ran `cd web && npm test src/components/node/__tests__/RerouteNode.performance.test.tsx`: Passed.
- Ran `make test-web`: All tests passed.
