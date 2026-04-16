# ⚡ Bolt: Zustand Selector Object Literal Equality Optimization

## 💡 What
Added `shallow` equality function to 24 different components and hooks that were returning object literals from `useNodes((state) => ({...}))`.

## 🎯 Why
Zustand's default equality function is strict equality (`===`). When `useNodes` is called with a selector that returns an object literal, a new object reference is created on every store update. In a ReactFlow application, the store updates continuously during drag operations (60fps). This causes all 24 of these components/hooks to trigger unnecessary React re-renders on every single frame, even when the data they actually care about hasn't changed.

## 📊 Impact
- Eliminates `O(N)` re-renders per frame during graph interaction for any component using these hooks.
- Significantly reduces main thread blocking during drag and drop operations.
- Improves perceived performance and smoothness of the UI.
- Prevents infinite render loops in components that might have `useEffect` hooks dependent on the returned object.

## 🔬 Measurement
Run `cd web && pnpm test -- performance` to see component render optimization benchmarks. The `componentPerformance.test.tsx` file explicitly tests that memoized selectors prevent 99% of unnecessary re-renders.

## 🧪 Testing
- `make typecheck` ✅
- `make lint` ✅
- `make test-web` ✅ (all tests pass)
