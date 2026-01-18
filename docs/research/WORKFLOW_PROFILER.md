# Workflow Performance Profiler (Experimental)

> **⚠️ Experimental Feature**: This is a research feature. API may change.

## Overview

The Workflow Performance Profiler is a built-in performance analysis tool for NodeTool that provides detailed insights into workflow execution. It helps users identify bottlenecks, understand parallelization opportunities, and optimize their AI workflows for better performance.

## Status

**Experimental** - This feature is ready for testing and feedback. The API and UI may evolve based on user input.

## Use Cases

- **Identify Performance Bottlenecks**: Automatically detect nodes that take the longest to execute
- **Optimize Parallel Execution**: Visualize which nodes run in parallel and which block the critical path
- **Profile Workflow Performance**: Track execution times across multiple runs to compare improvements
- **Debug Slow Workflows**: Understand where time is being spent in complex multi-node workflows
- **Capacity Planning**: Estimate workflow execution time based on historical data

## How It Works

### Architecture

The profiler consists of four main components:

1. **ProfilingStore** (`web/src/stores/ProfilingStore.ts`)
   - Central store for managing workflow performance profiles
   - Tracks node execution timing, layer assignments, and dependencies
   - Calculates critical path, bottlenecks, and parallelization efficiency

2. **WorkflowProfiler Panel** (`web/src/components/profiler/WorkflowProfiler.tsx`)
   - Main UI component with three tabs: Summary, Timeline, Bottlenecks
   - Displays execution progress and allows profile export

3. **PerformanceSummary** (`web/src/components/profiler/PerformanceSummary.tsx`)
   - Key metrics dashboard showing:
     - Total duration
     - Nodes executed
     - Failed nodes count
     - Average node time
     - Parallelization efficiency
     - Bottleneck nodes
     - Critical path

4. **PerformanceTimeline** (`web/src/components/profiler/PerformanceTimeline.tsx`)
   - Gantt-chart style visualization
   - Shows execution order and parallelization
   - Color-coded by layer

5. **PerformanceBottlenecks** (`web/src/components/profiler/PerformanceBottlenecks.tsx`)
   - Sorted list of nodes by execution time
   - Visual progress bars showing time distribution
   - Highlights slow nodes (>10% of total time)

### Data Model

```typescript
interface NodeExecutionProfile {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: "completed" | "error" | "cancelled";
  layer: number;
  parallelWith: string[];
  blockedBy: string[];
  isBottleneck: boolean;
}

interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  jobId: string;
  startedAt: number;
  finishedAt: number;
  totalDuration: number;
  nodeCount: number;
  nodes: Record<string, NodeExecutionProfile>;
  layers: string[][];
  criticalPath: string[];
  parallelizationEfficiency: number;
  bottleneckNodes: string[];
}
```

### Key Metrics

| Metric | Description |
|--------|-------------|
| **Total Duration** | Wall-clock time from workflow start to finish |
| **Parallelization Efficiency** | Ratio of total node time to wall-clock time (higher = more parallel) |
| **Critical Path** | Longest path through the workflow that determines minimum execution time |
| **Bottleneck Nodes** | Nodes taking >10% of total execution time |

## Usage Example

```typescript
import { useWorkflowProfiler } from "./hooks/useWorkflowProfiler";

// In your workflow execution component
const {
  startProfilingSession,
  recordExecutionStart,
  recordExecutionEnd,
  completeProfiling
} = useWorkflowProfiler({
  workflowId: workflow.id,
  workflowName: workflow.name,
  nodes,
  edges,
  isRunning: executionState === "running"
});

// When workflow starts
startProfilingSession();

// When a node starts executing
recordExecutionStart(node.id, node.data.label, node.type);

// When a node finishes
recordExecutionEnd(node.id, status === "completed" ? "completed" : "error");

// When workflow completes
completeProfiling(jobId);
```

## Integration Points

The profiler integrates with existing NodeTool infrastructure:

- **ExecutionTimeStore**: Uses timing data captured during execution
- **StatusStore**: References node status for profiling state
- **topologicalSort**: Uses graph algorithm to identify layers and parallelization
- **WorkflowRunner**: Can be connected to track real workflow executions

## Limitations

- **Single-Run Data**: Currently only profiles one execution at a time
- **No Historical Comparison**: Cannot compare across multiple runs yet
- **No Memory Profiling**: Only tracks execution time, not memory/CPU usage
- **No Real-Time Updates**: Profile is calculated after execution completes
- **Frontend-Only**: Backend timing data is not used (calculated on frontend)

## Future Improvements

1. **Multi-Run Comparison**: Compare performance across different workflow versions
2. **Memory & CPU Profiling**: Track resource usage during execution
3. **Real-Time Updates**: Show progress during execution, not just after
4. **Backend Integration**: Use backend-reported timing for accuracy
5. **Recommendations**: Suggest optimizations based on profile data
6. **Baseline Comparison**: Compare against historical averages
7. **Export Formats**: Export to CSV, JSON, and visualization formats

## Feedback

To provide feedback on this feature:

1. Test the profiler with your workflows
2. Report issues or unexpected behavior
3. Suggest improvements to the UI or metrics
4. Share use cases that would be valuable

## Files Reference

| File | Purpose |
|------|---------|
| `web/src/stores/ProfilingStore.ts` | Core profiling data store |
| `web/src/stores/__tests__/ProfilingStore.test.ts` | Unit tests for store |
| `web/src/components/profiler/WorkflowProfiler.tsx` | Main profiler panel |
| `web/src/components/profiler/PerformanceSummary.tsx` | Summary metrics view |
| `web/src/components/profiler/PerformanceTimeline.tsx` | Timeline visualization |
| `web/src/components/profiler/PerformanceBottlenecks.tsx` | Bottleneck analysis |
| `web/src/components/profiler/OpenProfilerButton.tsx` | Quick access button |
| `web/src/hooks/useWorkflowProfiler.ts` | Integration hook |
| `web/src/components/profiler/index.ts` | Export barrel |

## Related Documentation

- [AGENTS.md](../web/src/AGENTS.md) - Web application architecture
- [stores/AGENTS.md](../web/src/stores/AGENTS.md) - State management patterns
- [core/graph.ts](../web/src/core/graph.ts) - Graph utilities for layer analysis
