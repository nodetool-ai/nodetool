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
