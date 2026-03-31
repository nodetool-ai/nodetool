
# ⚡ Bolt: NodeInputs Performance Optimization

## 💡 What
Refactored `NodeInputs.tsx` to use a custom memoized selector `useConnectedEdgesSelector` instead of subscribing directly to `state.edges` via `useNodes` and filtering inline.

## 🎯 Why
`NodeInputs` previously subscribed to the entire `state.edges` array. Because React Flow updates the node/edge state on every frame during drag operations (60fps), `state.edges` constantly changed reference.
This caused all node input components to fully re-render on *any* graph edge change, even if the new edge was completely unrelated to that node.
By using a dedicated selector that returns a stable array reference when connected edges are identical, we eliminate these O(N*E) re-renders during interactions.

## 📊 Impact
- **Eliminates Unnecessary Computations:** Prevents O(N*E) array iterations per graph update.
- **Prevents Unnecessary Re-renders:** Fixes `NodeInputs` so it only re-renders when its specific connection state changes, not on any graph edge change.
- **Improved Responsiveness:** Frees up main thread time for smoother graph interactions, particularly when dragging nodes with many dynamic inputs.

## 🔬 Measurement
Verified using a performance regression test.
- Before: Adding an unrelated edge caused `NodeInputs` wrapper to re-render.
- After: Adding an unrelated edge does NOT cause `NodeInputs` wrapper to re-render.

## 🧪 Testing
- Created `web/src/hooks/nodes/__tests__/useConnectedEdges.test.ts` to verify stable references.
- Created `web/src/components/node/__tests__/NodeInputs.performance.test.tsx` to verify `NodeInputs` render counts.
- Ran `cd web && npm run typecheck`: Passed.
- Ran `cd web && npm run lint`: Passed.
- Ran `make test-web`: All tests passed.

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

# ⚡ Bolt: Node Property Connection Status Performance Optimization

## 💡 What
Created `useIsConnectedSelector` in `web/src/hooks/nodes/useIsConnected.ts` and rolled it out to property components (`ImageSizeProperty.tsx`, `Model3DProperty.tsx`, `ModelProperty.tsx`, and `StringProperty.tsx`).
This replaces inline `.some()` edge lookups with a memoized Zustand selector that caches the previous `state.edges` array reference.

## 🎯 Why
Previously, any node property component that needed to check if it had an incoming edge (to hide/show the input field) would evaluate `state.edges.some(...)` on every Zustand state update.
Because React Flow updates the node/edge state on every frame during drag operations (60fps), this caused N properties to loop over E edges 60 times a second, even when the edges themselves hadn't changed.
`ModelProperty.tsx` was particularly problematic as it subscribed to the *entire* `state.edges` array, causing it to fully re-render on any unrelated graph change.

## 📊 Impact
- **Eliminates Unnecessary Computations:** Reduces O(N*E) array iterations per drag frame to O(1) selector executions when edges are unmodified.
- **Prevents Unnecessary Re-renders:** Fixes `ModelProperty` so it only re-renders when its specific connection state changes, not on any graph edge change.
- **Improved Responsiveness:** Frees up main thread time for smoother graph interactions.

## 🔬 Measurement
Verify by checking React Profiler during node drag operations. Total scripting time per frame is reduced compared to evaluating all edges constantly. The `ModelProperty` specifically will no longer re-render on unrelated graph changes.

## 🧪 Testing
- Ran `cd web && npm run typecheck`: Passed.
- Ran `cd web && npm run lint`: Passed.
- Ran `make test-web`: All tests passed.

# ⚡ Bolt: Optimize Zustand record filtering

## 💡 What
Replaced expensive `Object.fromEntries(Object.entries(record).filter(...))` patterns in `ErrorStore`, `ExecutionTimeStore`, and `VibeCodingStore` with optimized `for...in` loops and shallow-copy-and-delete mechanisms.

## 🎯 Why
`Object.entries().filter()` operations on large Zustand store state dictionaries create expensive intermediate arrays, which negatively impact performance and garbage collection, especially during rapid store updates or UI re-renders. Replacing them with `for...in` iteration prevents these allocations.

## 📊 Impact
- **Improves Memory Efficiency:** Eliminates O(N) intermediate array allocations during record cleanup operations.
- **Reduces Main Thread Work:** Directly assigns objects to a pre-allocated cache map.
- **Enhances Best Practices:** Standardizes record filtering methods across multiple critical Zustand stores (and updates `ZUSTAND_BEST_PRACTICES.md` to guide future developers).

## 🔬 Measurement
Verify by capturing a memory allocation profile while triggering operations like `clearErrors` or `clearTimings`. Notice the elimination of `Array` allocations associated with the `Object.entries` conversions in these code paths.

## 🧪 Testing
- `npm run lint` and `npm run typecheck` run inside the `web` folder.
- Store test files confirm logic parity.

# ⚡ Bolt: GroupNode Child Check Performance Optimization

## 💡 What
Refactored `GroupNode.tsx` to combine two separate `useNodes` subscriptions into a single optimized `for` loop that checks for children and bypassed children simultaneously.

## 🎯 Why
Previously, every `GroupNode` on the canvas subscribed to `state.nodes` using two separate `.some()` loops.
Because ReactFlow updates the `nodes` array reference on every drag frame (60fps), these loops ran continuously during interactions.
This caused O(G * N) operations per frame (where G = number of group nodes, N = total nodes), taking up valuable main thread time.

## 📊 Impact
- **Reduces Main Thread Work:** Combines two O(N) array iterations into a single loop.
- **Early Exit:** The loop stops as soon as both conditions (`hasChildren` and `someChildrenBypassed`) are met, further reducing iteration time.
- **Improved Responsiveness:** Smoother node dragging when workflows contain Group Nodes.

## 🔬 Measurement
Verify by checking the React Profiler during node drag operations with multiple group nodes. The `useNodes` selector execution time within `GroupNode` will be significantly reduced.

## 🧪 Testing
- Ran `cd web && pnpm typecheck`: Passed.
- Ran `cd web && pnpm lint`: Passed.
- Ran `make test-web`: Verified core tests pass.

# ⚡ Bolt: WorkflowAssistantChat Nodes Subscription Optimization

## 💡 What
Added `areNodesEqualIgnoringPosition` equality function to the `useNodes` subscription in `WorkflowAssistantChat.tsx`.

## 🎯 Why
`WorkflowAssistantChat` was subscribing to `state.nodes` without a custom equality function. Since ReactFlow updates the `nodes` array reference on every drag frame (for positional updates), this caused the entire chat panel component to re-render unnecessarily on every single drag frame (60fps) even when node data didn't change.

## 📊 Impact
- **Eliminates Unnecessary Re-renders:** The chat component now ignores positional node updates during dragging.
- **Reduces Main Thread Work:** Prevents evaluating complex message logic on every drag frame.
- **Improved Responsiveness:** Smoother drag-and-drop experience in the node editor when the chat panel is open.

## 🔬 Measurement
Verify by opening the Workflow Assistant chat panel and dragging nodes around in a large workflow. Using React Profiler, observe that `WorkflowAssistantChat` no longer re-renders during drag operations.

## 🧪 Testing
- Ran `cd web && pnpm typecheck`: Passed.
- Ran `cd web && pnpm lint`: Passed.
- Ran `make test-web`: All tests passed.

# ⚡ Bolt: NodeStore getSelectedNodeCount Performance Optimization

## 💡 What
Optimized `getSelectedNodeCount()` in `NodeStore.ts` by adding an internal cache inside the state factory to memoize the selected node count based on the `state.nodes` array reference.

## 🎯 Why
`state.getSelectedNodeCount()` computes the result by iterating over all nodes (`O(N)`). Several UI components (like `Toolbar` in `BaseNode.tsx`, `NodeEditor`, and `DynamicNode`s) subscribed to this selector via `useNodes()`. Because it was evaluated on every store update (which occurs at 60fps during node dragging), this caused an `O(K * N)` bottleneck per frame (where K is the number of subscribed components). By caching the result internally, we reduce this to `O(N)` once per state update when the array actually changes, and `O(1)` for all subsequent selector executions within the same state frame.

## 📊 Impact
- **Eliminates Unnecessary Array Iterations:** Reduces `O(K * N)` loops per store update to `O(N)`.
- **Improved Drag Smoothness:** Frees up main thread time for React Flow to handle drag updates more smoothly, especially when nodes are selected and the `Toolbar` is active.

## 🔬 Measurement
Verify by checking React Profiler during node drag operations with multiple nodes selected. The "Scripting" time will be reduced because the `getSelectedNodeCount` selector will return instantly from the cache.

## 🧪 Testing
- Created `web/src/__tests__/performance/NodeStoreSelection.performance.test.ts` to verify caching behavior.
- Ran `cd web && pnpm typecheck`: Passed.
- Ran `cd web && pnpm lint`: Passed.
- Ran `make test-web`: All core and performance tests passed.

# ⚡ Bolt: NodeToolsSelector Optimization

## 💡 What
Optimized `nodeTools` computation in `web/src/components/chat/composer/NodeToolsSelector.tsx`.
Replaced the expensive chained iteration (`Object.values(metadata).filter(...).reduce(...)`) with a single efficient `for...in` loop.

## 🎯 Why
`metadata` is a large object containing all node type definitions. `Object.values()` creates a massive intermediate array, which is then copied again by `.filter()`, before finally being iterated by `.reduce()`. This creates unnecessary memory allocations and garbage collection overhead, which impacts frontend performance whenever the `useMemo` is recalculated. Using a simple `for...in` loop accomplishes the same dictionary transformation in a single pass without intermediate arrays.

## 📊 Impact
- **Improves Memory Efficiency:** Eliminates O(N) intermediate array allocations during node tools computation.
- **Reduces Main Thread Work:** Converts an O(3N) operation into O(N) with a smaller constant factor.
- **Improved Responsiveness:** Ensures faster UI updates when interacting with the Chat Composer's node tools selector.

## 🔬 Measurement
Verify by capturing a memory allocation profile while opening the Chat Composer's Node Tools Selector with a large number of nodes loaded. Notice the elimination of `Array` allocations associated with the `Object.values` conversion.

## 🧪 Testing
- `npm run typecheck` and `npm run lint` run inside the `web` folder.
