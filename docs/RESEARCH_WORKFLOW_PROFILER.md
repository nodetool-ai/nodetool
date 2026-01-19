# Workflow Performance Profiler (Experimental)

## Overview

**Workflow Performance Profiler** is an experimental feature that analyzes and visualizes workflow execution performance, helping users identify bottlenecks and optimize their AI workflows.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Researchers**: Analyze execution times to understand workflow performance characteristics
- **Developers**: Identify slow nodes that may need optimization
- **Advanced Users**: Compare execution times across different workflow versions

## How It Works

The profiler builds on the existing `ExecutionTimeStore` which already tracks per-node execution timing during workflow runs. The new `WorkflowProfilerStore` aggregates this data to provide:

1. **Aggregate Statistics**: Total workflow time, average node time, max/min durations
2. **Bottleneck Identification**: Automatically identifies the top 5 slowest nodes
3. **Visual Timeline**: Shows execution timeline with relative duration bars
4. **Stale Data Detection**: Warns when profile data may be outdated

### Architecture

```
WorkflowProfilerStore
├── analyzeWorkflow(workflowId, nodes) → Aggregates timing data
├── getAllTimings(workflowId) → Collects from ExecutionTimeStore
├── profile: WorkflowProfile
│   ├── totalDuration, avgDuration, maxDuration, minDuration
│   ├── nodes: NodeTiming[] (all nodes with timing)
│   └── bottlenecks: NodeTiming[] (top 5 slowest)
└── PerformancePanel (dockview panel)
    └── WorkflowProfiler (visualization component)
```

## Usage Example

```typescript
import { WorkflowProfiler, PerformancePanel } from "../components/profiler";

// In a dockview-enabled context:
<PerformancePanel workflowId="workflow-123" />

// Or standalone:
<WorkflowProfiler workflowId="workflow-123" />
```

### Integration with Workflow Execution

The profiler automatically captures timing data from the existing workflow execution flow:
1. `ExecutionTimeStore.startExecution()` - called when node starts
2. `ExecutionTimeStore.endExecution()` - called when node completes
3. `WorkflowProfilerStore.analyzeWorkflow()` - called to aggregate results

## Limitations

- **Single Execution**: Currently only profiles the most recent execution
- **No Historical Data**: Doesn't store historical profiles for comparison
- **No Backend Correlation**: Doesn't correlate with server-side timing metrics
- **Refresh Required**: Users must manually re-analyze for updated data

## Future Improvements

- Historical profile comparison
- Automatic re-analysis on execution completion
- Integration with server-side performance metrics
- Export profiling data for external analysis
- Customizable timing thresholds for bottleneck alerts

## Files Created

- `web/src/stores/WorkflowProfilerStore.ts` - Data aggregation store
- `web/src/components/profiler/WorkflowProfiler.tsx` - Main visualization component
- `web/src/components/profiler/PerformancePanel.tsx` - Dockview panel wrapper
- `web/src/components/profiler/index.ts` - Public exports

## Feedback

To provide feedback on this feature:
1. Test with various workflow types and sizes
2. Report performance issues or UI bugs
3. Suggest additional metrics or visualizations
