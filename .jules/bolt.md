# Bolt Journal

## 2024-11-20 - Optimize Zustand Selectors
**Learning:** Subscribing to an entire array like `state.nodes` in a widely-used hook (`useInputMinMax`) triggers N-squared re-renders across the canvas because the array reference changes on every single node mutation (e.g., during dragging).
**Action:** Select only the minimal primitive values needed for the specific node (e.g., `[nodeMin, nodeMax]`) rather than the entire `nodes` array.
