
# ⚡ Bolt: useSelectedNodesInfo Hook Array Allocation Optimization

## 💡 What
Refactored `useSelectedNodesInfo.ts` to include a custom equality function for the `useNodes((state) => state.getSelectedNodes())` subscription.

## 🎯 Why
`useSelectedNodesInfo` is used by the Node Info Panel and previously subscribed to `state.getSelectedNodes()` using Zustand's default strict equality (`===`).
Since `getSelectedNodes()` returns a newly mapped array on *every* store update (which includes every 60fps frame during drag operations), the hook would continuously return a new array reference, triggering unneeded full React component re-renders for the Node Info Panel, even if the selected nodes themselves had not changed.

By passing a custom equality function that explicitly shallow-compares the array length and elements:
```typescript
(a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
```
Zustand now returns the stable previously cached array reference if the contents are the same.

## 📊 Impact
- **Eliminates Unnecessary Re-renders:** Prevents the Node Info Panel and associated hooks from re-rendering continuously while dragging selected nodes.
- **Improved Responsiveness:** Decreases main thread workload during intensive graph interactions like drag-and-drop.

## 🔬 Measurement
Verified using a performance regression test.
- Before: Calling `rerender()` in testing without changing the nodes resulted in `initialNodesInfo === subsequentNodesInfo` evaluating to `false`.
- After: Calling `rerender()` with identical underlying nodes now evaluates to `true`, confirming stable array references and preventing re-renders.

## 🧪 Testing
- Created `web/src/__tests__/performance/useSelectedNodesInfo.test.tsx` to verify component reference stability.
- Ran `cd web && pnpm test -- performance`: All performance tests passed successfully.
