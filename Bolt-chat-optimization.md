# ⚡ Bolt: Chat Thread & State Deduplication Optimization

## 💡 What: The optimization implemented
Replaced multiple inefficient `array.findIndex()` and `array.reduce()` calls with `array.findLastIndex()` in `web/src/stores/AgentStore.ts` and `web/src/components/chat/thread/ChatThreadView.tsx`.

## 🎯 Why: The performance problem it solves
1. **Streaming Deduplication Bottleneck:** When the Claude agent is executing and streaming logs or message chunks, it continuously dispatches events. The `AgentStore` was updating the `messages` array by calling `state.messages.findIndex(existing => existing.id === converted.id)` on *every* stream tick. Because `findIndex` scans from the beginning of the array, and the streamed message is almost always at the very end of the chat history, this created an O(N²) time complexity bottleneck during long generations.
2. **Component Re-render Scan:** In `ChatThreadView.tsx`, the component was finding the index of the last user message using `filtered.reduce((lastIdx, msg, idx) => (msg.role === "user" ? idx : lastIdx), -1)`. This forced a full O(N) array scan every time the `messages` array changed (which happens 60+ times per second during streaming).

## 📊 Impact: Expected performance improvement
*   **O(N) to O(1) Streaming Updates:** `state.messages.findLastIndex()` will find the currently streaming message on its first iteration (O(1)) instead of scanning the entire message history up to that point. This directly unblocks the main thread during high-frequency agent execution streams.
*   **Faster Renders:** The chat view now finds the last user message in O(1) to O(K) time (where K is the number of assistant messages after the user), preventing an unnecessary full array iteration on every render frame.

## 🔬 Measurement: How to verify the improvement
Observe the CPU profile and main thread blocking time during a long-running Claude Agent session with a long chat history. The time spent in Zustand store updates and `MemoizedMessageList` render calculations will be significantly reduced.

## 🧪 Testing: Commands run and results
- `make test-web`: All frontend tests pass successfully.
- `cd web && pnpm typecheck`: Passed cleanly with no regressions.
- `cd web && pnpm lint`: Passed cleanly.