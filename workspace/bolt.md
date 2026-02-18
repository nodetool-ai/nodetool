## 2026-02-17 - Optimizing Log Subscriptions with Zustand
**Learning:** Zustand's default selector equality is strict equality (`===`). If a selector returns a new reference (like `array.filter()` does), the component will re-render on EVERY store update, even if the data content is identical. This is O(N) re-renders for N components.
**Action:** Use `useStoreWithEqualityFn` (from `zustand/traditional`) with `shallow` equality (from `zustand/shallow`) when selecting derived arrays or objects to prevent unnecessary re-renders.

## 2024-05-22 - [Optimizing ReactFlow Edge Processing]
**Learning:** In complex graph visualization, separating edge processing into 'structural' (heavy, topological) and 'state-based' (light, selection/status) phases using `useMemo` can prevent expensive re-calculations on every selection or status update.
**Action:** When optimizing hooks with mixed heavy/light dependencies, split them into two `useMemo` blocks: one for structure (keyed by topology hash) and one for merging state.
