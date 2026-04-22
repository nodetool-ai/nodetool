# ⚡ Bolt: Use findLastIndex for high-frequency streaming array updates

## 💡 What
Replaced `Array.findIndex()` with `Array.findLastIndex()` in `web/src/core/chat/chatProtocol.ts` and `web/src/hooks/useExecutionTreeState.ts` when locating existing tool calls and task steps during state updates.

## 🎯 Why
During execution streams, tool calls and execution steps are continuously updated via WebSocket events. These updates are stored sequentially. By using `findIndex()`, the frontend was scanning from the beginning of these arrays on every incoming chunk. For a workflow with many steps or long tool call histories, this creates an O(N²) time complexity bottleneck that can block the main thread, causing UI stutters. Since the updates typically apply to the most recently appended items, searching backwards is significantly faster.

## 📊 Impact
Changes the lookup from O(N) worst-case to O(1) best/average-case for the most frequent operation (updating the current active step/tool call). This drastically reduces CPU overhead and main thread blocking during intense LLM streaming or multi-step workflow executions.

## 🔬 Measurement
This optimization can be observed when executing agents with long tool call histories or complex workflows; the React profiler will show reduced render time in components consuming `useExecutionTreeState` and the chat protocol reducers.

## 🧪 Testing
- `make typecheck` verified types remain completely sound.
- `make lint` passed.
- `make test` executed all test suites successfully.
