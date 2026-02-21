# ⚡ Bolt: Split Edge Processing for Performance

## 💡 What
Refactored `useProcessedEdges` hook to split edge processing into two distinct phases:
1.  **Structural Phase (Heavy):** Computes edge types, gradients, and static styling. Memoized based on graph structure (`edges`, `nodes`, `dataTypes`).
2.  **Status Phase (Light):** Applies execution status updates (animations, counters, `message-sent` class) to the pre-computed structural edges.

## 🎯 Why
During workflow execution, status updates arrive frequently (streaming). Previously, every status update triggered a full re-computation of edge types and gradients (O(N*M) where M is complexity of type resolution).
By splitting the logic, frequent status updates only trigger a lightweight O(N) pass to append classes, while the expensive structural logic is skipped.

## 📊 Impact
- **Reduces Main Thread Work:** significantly reduces CPU time during workflow execution, especially for large graphs.
- **Improved Responsiveness:** UI remains responsive even with high-frequency status updates.
- **Preserves Correctness:** Maintains all visual features (gradients, reroute tracing) and existing optimizations (drag freezing).

## 🔬 Measurement
Verify by running a workflow and observing that `useStructurallyProcessedEdges` (internal hook) is NOT re-executed when only status changes, whereas `useProcessedEdges` (wrapper) updates efficiently.

## 🧪 Testing
Run `npm test src/hooks/__tests__/useProcessedEdges.test.ts` to verify no regressions in functionality.
Type checking passed via `npm run typecheck`.
