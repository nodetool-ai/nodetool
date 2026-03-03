# ⚡ Bolt: Property Edge Subscriptions

## 💡 What
Refactored `ImageSizeProperty`, `ModelProperty`, `CollectionProperty`, and `StringProperty` to optimize their `useNodes` selectors that depend on `state.edges`.
- `ModelProperty` and `CollectionProperty` now use a specific `state.edges.some(...)` check inside the `useNodes` selector, rather than returning the entire `edges` array and computing `some(...)` in a `useMemo`.
- `StringProperty` now uses `shallow` equality from `zustand/shallow` to prevent re-renders when its returned object (`{ isConnected, stringInputConfig }`) contains identical primitive values.
- `ImageSizeProperty` already had a good specific selector, so it was left untouched.

## 🎯 Why
Previously, properties like `ModelProperty` and `CollectionProperty` subscribed to the entire `state.edges` array. Since React Flow updates this array reference on *every* edge change in the entire graph (additions, removals, animations, status updates), these property components would re-render continuously, even if the edge changes were completely unrelated to them. This caused significant main thread overhead during workflow execution and editing in large graphs.

## 📊 Impact
- **Eliminates Unnecessary Re-renders:** These property components now only re-render when their specific connection status changes (e.g., when a wire is specifically connected to or disconnected from their property handle).
- **Reduces Main Thread Work:** Prevents O(N) component re-renders per frame where N is the number of property fields in the visible graph.
- **Improved Responsiveness:** Smoother editing and execution experience, especially in dense workflows with many dropdowns and properties.

## 🔬 Measurement
Verify by opening a workflow with many dropdowns/properties (e.g., multiple Model or String properties).
Use React DevTools "Highlight updates when components render".
Before: Adding an unrelated edge or seeing animated edges causes all these property fields to flash.
After: Adding an unrelated edge does NOT cause these property fields to flash.

## 🧪 Testing
- Ran `make typecheck`: Passed.
- Ran `make lint`: Passed.
- Ran `make test-web`: All tests passed.
