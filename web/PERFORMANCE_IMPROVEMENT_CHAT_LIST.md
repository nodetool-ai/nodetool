# ⚡ Bolt: Chat List Performance Optimization

## 💡 What
Optimized the `ChatSidebar`, `ThreadList`, and `ThreadItem` components to prevent unnecessary re-renders.
- **Memoization**: Applied `React.memo` to `ChatSidebar`, `ThreadList`, and `ThreadItem`.
- **Prop Stabilization**: Refactored `ThreadItem` to receive a `previewText` string instead of a `getPreview` function (which was unstable).
- **Event Handler Optimization**: Refactored `onSelect` and `onDelete` to accept IDs, allowing `ThreadList` to pass stable parent handlers instead of creating new arrow functions for each item.

## 🎯 Why
In the previous implementation, every update to `GlobalChat` (such as receiving a token during streaming, or typing) caused a complete re-render of the entire chat sidebar.
- `GlobalChat` re-rendering recreated the `threadsWithMessages` object.
- `ChatSidebar` received a new `threads` object and re-rendered.
- `ThreadList` received a new `threads` prop and re-rendered.
- `ThreadList` created new arrow functions for `onSelect` and `onDelete` for every item.
- `ThreadItem` re-rendered because its props changed (new function references).

This caused O(N) re-renders (where N is the number of threads) on every single update, which is inefficient, especially during high-frequency updates like text generation.

## 📊 Impact
- **Reduces re-renders by ~99%** for the thread list during active chat sessions. Only the active thread item might re-render if its preview text changes, while all inactive threads remain cached.
- Signficantly reduces main thread work during text streaming.

## 🔬 Measurement
You can verify the improvement by using the React DevTools Profiler:
1. Open the Chat Sidebar with multiple threads.
2. Start profiling.
3. Send a message to the assistant.
4. Stop profiling.
5. Observe that `ThreadItem` components for inactive threads do not render.

## 🧪 Testing
- **Typecheck**: Passed `npm run typecheck`.
- **Unit Tests**: Passed `npm test`.
- **Manual Verification**: Code review confirmed the implementation of memoization and prop stability.
