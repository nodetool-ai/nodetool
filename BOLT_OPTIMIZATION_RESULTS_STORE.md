# ⚡ Bolt: Optimize ResultsStore updates

## 💡 What
Refactored `ResultsStore.ts` to use `set((state) => ...)` callback pattern instead of `set({ ...get().prop })`. This was applied to:
- `setPlanningUpdate`
- `setPreview`
- `setEdge`
- `setToolCall`
- `setTask`
- `setResult`
- `setOutputResult`
- `setProgress`
- `addChunk`

## 🎯 Why
Previously, the store methods were using `get()` to access the current state before calling `set()`. This is an anti-pattern in Zustand because:
1.  It incurs extra function call overhead.
2.  It reads state outside the `set` transaction, potentially leading to race conditions if multiple updates are queued (e.g. rapid streaming updates).
3.  It makes the code less declarative.

By using the functional update form `set((state) => ({ ... }))`, we ensure that we are always working with the most current state at the time of the update application.

## 📊 Impact
*   **Correctness**: Prevents potential race conditions during high-frequency updates (like token streaming).
*   **Code Quality**: Aligns with `ZUSTAND_BEST_PRACTICES.md`.
*   **Performance**: Slight reduction in overhead by avoiding `get()` calls.

## 🔬 Measurement
Verified by running the existing test suite `web/src/stores/__tests__/ResultsStore.test.ts`. The behavior remains identical, but the implementation is more robust.

## 🧪 Testing
*   `npm run test -- src/stores/__tests__/ResultsStore.test.ts`: Passed (36 tests).
*   `npm run typecheck` (web): Passed.
*   `npm run lint` (web): Passed.
