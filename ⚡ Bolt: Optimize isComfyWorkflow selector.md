# ⚡ Bolt: NodeStore isComfyWorkflow Optimization

## 💡 What
Optimized `isComfyWorkflow()` in `NodeStore.ts` by adding an internal cache inside the state factory to memoize the boolean result based on the `state.nodes` array reference and `workflow.settings` reference.

## 🎯 Why
`state.isComfyWorkflow()` computes the result by iterating over all nodes (`O(N)`) to check if any have a "comfy." prefix. Several UI components (like `FloatingToolBar.tsx` and `AppToolbar.tsx`) subscribe to this selector via `useNodes()`. Because it evaluated on every store update (which occurs at 60fps during node dragging), this caused an `O(N)` loop per frame. By caching the result internally, we reduce this to `O(N)` once per state update when the nodes array actually changes, and `O(1)` for all subsequent executions within the same state frame or when nodes/settings remain unchanged.

## 📊 Impact
- **Eliminates Unnecessary Array Iterations:** Reduces `O(N)` loops per store update to `O(1)` when nodes haven't changed.
- **Improved Drag Smoothness:** Frees up main thread time for React Flow to handle drag updates more smoothly.

## 🔬 Measurement
Verify by checking React Profiler during node drag operations. The "Scripting" time will be reduced because the `isComfyWorkflow` selector will return instantly from the cache.

## 🧪 Testing
- Ran `cd web && pnpm typecheck`: Passed.
- Ran `cd web && pnpm lint`: Passed.
- Ran `make test-web`: All core and performance tests passed.
