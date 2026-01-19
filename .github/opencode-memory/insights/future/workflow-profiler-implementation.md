# Workflow Performance Profiler Implementation

## Technical Approach

### Building on Existing Infrastructure

The profiler leverages the existing `ExecutionTimeStore` which already tracks per-node timing during workflow execution. This avoids duplicating timing collection logic and ensures consistency with the existing execution flow.

```typescript
// ExecutionTimeStore already tracks:
interface ExecutionTiming {
  startTime: number;
  endTime?: number;
}

// WorkflowProfilerStore aggregates this into:
interface WorkflowProfile {
  totalDuration: number;
  avgDuration: number;
  maxDuration: number;
  nodes: NodeTiming[];
  bottlenecks: NodeTiming[];
}
```

### Key Design Decisions

1. **Separate Store Pattern**: Created `WorkflowProfilerStore` to handle profiling logic separately from execution tracking. This keeps concerns distinct and allows profiling to evolve independently.

2. **Dockview Panel Integration**: The `PerformancePanel` follows the existing panel pattern used in the Dashboard, making it consistent with the rest of the UI.

3. **Memoized Components**: Used `React.memo` and `useMemo` throughout to prevent unnecessary re-renders during workflow editing.

### Component Structure

```
PerformancePanel (Dockview wrapper)
└── WorkflowProfiler (Main visualization)
    ├── StatCard ×4 (Aggregate stats)
    ├── Table (Bottleneck list)
    └── Box (Timeline visualization)
```

## Patterns Used

### Zustand Store with External State Access

```typescript
const getAllTimings = (workflowId: string): NodeTiming[] => {
  // Access ExecutionTimeStore state directly
  const timings = useExecutionTimeStore.getState().timings;
  // Transform and filter...
};
```

### Selective State Subscription

```typescript
const profile = useWorkflowProfilerStore((state) => state.profile);
const isProfiling = useWorkflowProfilerStore((state) => state.isProfiling);
```

## Lessons Learned

1. **TypeScript Strict Mode**: Required careful attention to null checks and type narrowing, especially when TypeScript couldn't infer control flow through early returns.

2. **Import Path Consistency**: Following existing patterns (e.g., `useNodes` from `NodeContext` instead of direct store access) ensures consistency with the codebase architecture.

3. **Dockview Integration**: Using `IDockviewPanelProps` from the `dockview` package requires understanding which properties are optional vs. required.

## Future Enhancements

1. **Historical Comparison**: Store multiple profiles for comparison
2. **Automatic Trigger**: Auto-analyze on workflow completion
3. **Server Integration**: Correlate with backend timing metrics
4. **Export Functionality**: Export profiling data as JSON/CSV
5. **Custom Thresholds**: User-configurable slowdown alerts
