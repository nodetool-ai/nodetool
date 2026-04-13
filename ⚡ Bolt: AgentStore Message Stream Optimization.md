# ⚡ Bolt: AgentStore Message Stream Optimization

## 💡 What
Replaced `findIndex` with `findLastIndex` when updating streaming messages in the Claude Agent Store.

## 🎯 Why
In `web/src/stores/AgentStore.ts`, the SDK proxies real-time streaming LLM events into `AgentStore`. On each stream event, the code previously iterated over the array from the beginning using `findIndex` to find and update the most recent message. Because streaming tokens are received at a very high frequency and the updated message is almost always the last one, `findIndex` caused an O(N²) time complexity bottleneck that blocked the main thread. By switching to `findLastIndex`, the search completes in O(1) time because the target element is near or at the very end of the array.

## 📊 Impact
- **Improved Performance for Chat Sessions:** Re-renders and array iteration are significantly faster during long, high-frequency stream events.
- **Removed Main Thread Bottleneck:** Prevents the browser main thread from freezing during large continuous LLM completions.

## 🔬 Measurement
Verify by using the profiler during a long Claude agent chat response, measuring the time taken to process incoming websocket payload updates. `findLastIndex` will show substantially less CPU time spent on array traversal as the number of messages grows.

## 🧪 Testing
- The modified code has been type-checked correctly (`pnpm typecheck`).
- Evaluated for regressions by successfully passing all tests (`pnpm test`).
