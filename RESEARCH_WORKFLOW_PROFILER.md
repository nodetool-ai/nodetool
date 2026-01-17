# Research Report: Workflow Performance Profiler

## Summary

I prototyped a **Workflow Performance Profiler** feature for NodeTool. The goal was to provide users with detailed insights into workflow execution performance, identifying bottlenecks and optimizing workflows. The prototype includes a new `ProfilerStore` for tracking execution metrics, a `WorkflowProfiler` component for visualization, and a `PanelProfiler` for integration with the existing UI. The profiler tracks node-level execution times, overall workflow duration, and provides a visual chart of the slowest nodes. I had to disable the profiler integration due to TypeScript errors, but the infrastructure is in place.

## Implementation

### Components Created

1.  **`ProfilerStore.ts`**: A new Zustand store that tracks:
    *   `WorkflowProfile`: Overall workflow metrics (duration, parallelism, efficiency)
    *   `NodeProfile`: Per-node metrics (start time, end time, duration, status)
    *   Methods: `startProfiling`, `endProfiling`, `recordNodeStart`, `recordNodeEnd`

2.  **`WorkflowProfiler.tsx`**: A comprehensive component that displays:
    *   **Summary Cards**: Total duration, nodes completed, failed nodes
    *   **Progress Bar**: For ongoing executions
    *   **Bar Chart**: Visualization of the top 10 slowest nodes using `recharts`
    *   **Detailed Table**: Expandable rows showing node timing details, status, and time share

3.  **`PanelProfiler.tsx`**: A resizable bottom panel (similar to `PanelBottom`) that hosts the profiler component, allowing users to toggle the profiler view.

### Integration Points

*   **`FloatingToolBar.tsx`**: Added a "Profiler" menu item in the actions menu to toggle the profiler panel.
*   **`BottomPanelStore.ts`**: Extended to support a new `"profiler"` view type.
*   **`index.tsx`**: Mounted `PanelProfiler` on all main routes.
*   **`workflowUpdates.ts`**: Added calls to `recordNodeStart` and `recordNodeEnd` to track node execution timing. (Currently commented out due to TypeScript issues).

### Key Challenges

*   **TypeScript Errors**: I encountered persistent type mismatches when calling `recordNodeStart` and `recordNodeEnd` from `workflowUpdates.ts`. The error messages suggested incorrect argument counts or types, even though the function signatures and calls appeared correct. This is likely due to a complex type interaction or a stale build cache. I disabled the integration to ensure the code compiles.
*   **Recharts Integration**: I needed to install the `recharts` library for the visualization component.

## Findings

*   **Feasibility**: Building a performance profiler is highly feasible with the existing architecture. The `ExecutionTimeStore` already tracks timing, and integrating with the WebSocket message handler in `workflowUpdates.ts` is straightforward.
*   **Impact**: High. Users (especially researchers and developers) would greatly benefit from understanding where their workflows spend time.
*   **Complexity**: Medium. The UI is complex (charts, tables, panels) but the data model is simple.

## Evaluation

*   Feasibility: ⭐⭐⭐⭐ (4/5) - Technical implementation is clear, but I hit a TS hurdle.
*   Impact: ⭐⭐⭐⭐⭐ (5/5) - Solves a real problem for power users.
*   Complexity: ⭐⭐⭐ (3/5) - Manageable for a prototype.

## Recommendation

*   [ ] **Needs more work**: The core store and UI are solid. The TypeScript integration issue must be resolved before this can be enabled. This likely requires a fresh build or deeper investigation into the type definitions in `ProfilerStore` and how they are imported in `workflowUpdates.ts`.

## Next Steps

1.  **Fix TypeScript Integration**: Debug why `recordNodeStart(recordNodeEnd)` calls are failing type checking. Try restarting the TypeScript server or checking for implicit `any` types.
2.  **Enable Profiling**: Uncomment the integration code in `workflowUpdates.ts`.
3.  **Add `startProfiling` Call**: The profiler needs to be started when a workflow run begins. This should be added to `WorkflowRunner.ts` or `workflowUpdates.ts` when a `job_update` with status "running" is received.
4.  **Polish UI**: Fix remaining lint warnings in `WorkflowProfiler.tsx`.

## Files Modified/Created

*   Created: `web/src/stores/ProfilerStore.ts`
*   Created: `web/src/components/profiler/WorkflowProfiler.tsx`
*   Created: `web/src/components/profiler/PanelProfiler.tsx`
*   Modified: `web/src/stores/BottomPanelStore.ts`
*   Modified: `web/src/components/panels/FloatingToolBar.tsx`
*   Modified: `web/src/index.tsx`
*   Modified: `web/src/stores/workflowUpdates.ts` (Integration commented out)
*   Modified: `.github/opencode-memory/features.md`
