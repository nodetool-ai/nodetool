# Performance Profiling Implementation

## Overview

Implemented a comprehensive workflow performance profiling system inspired by browser developer tools. The system provides real-time performance monitoring, bottleneck identification, and optimization suggestions for AI workflows.

## Technical Implementation

### Core Components

1. **PerformanceProfilerStore** (`web/src/stores/PerformanceProfilerStore.ts`)
   - Aggregates performance metrics from ExecutionTimeStore
   - Tracks node execution timing, status, and workflow-level statistics
   - Maintains historical profiling sessions (last 50 per workflow)
   - Provides bottleneck detection and optimization suggestions
   - Uses Zustand with persistence for cross-session data

2. **useWorkflowProfiler Hook** (`web/src/hooks/useWorkflowProfiler.ts`)
   - React hook for integrating profiling into components
   - Provides `formatDuration` for human-readable time display
   - `getTimelineData()` for visualization
   - `getExecutionSummary()` for quick stats
   - `getBottlenecks()` for optimization insights

3. **PerformanceProfiler Component** (`web/src/components/profiler/PerformanceProfiler.tsx`)
   - Visual profiler with accordion-based UI
   - Four main sections:
     - **Execution Summary**: Total duration, node counts, efficiency rating
     - **Execution Timeline**: Visual Gantt-style timeline of node execution
     - **Bottlenecks & Suggestions**: Identified slow nodes with recommendations
     - **Node Rankings**: Top 10 slowest nodes with percentage breakdown

### Key Features

- **Real-time Profiling**: Start/stop profiling during workflow execution
- **Bottleneck Detection**: Automatically identifies nodes taking >5s or >30% of total time
- **Smart Suggestions**: Context-aware optimization recommendations based on node type:
  - LLM/Model nodes: "Consider using faster model or enable caching"
  - Image/Video nodes: "Consider reducing resolution or batch processing"
  - Audio nodes: "Consider reducing quality or chunk size"
- **Efficiency Rating**: Automatic workflow performance rating (Excellent/Good/Needs Improvement/Poor)
- **Historical Tracking**: Stores up to 50 profiling sessions per workflow

### Data Model

```typescript
interface NodeProfile {
  nodeId: string;
  nodeType: string;
  duration: number;
  startTime: number;
  endTime: number;
  status: "completed" | "failed" | "running";
}

interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  nodes: NodeProfile[];
  timestamp: number;
}

interface BottleneckInfo {
  nodeId: string;
  nodeType: string;
  duration: number;
  percentageOfTotal: number;
  severity: "high" | "medium" | "low";
  suggestion: string;
}
```

## Integration Points

### ExecutionTimeStore
- The profiler reads timing data from ExecutionTimeStore
- No modifications to existing execution tracking code needed
- Complementary to existing execution time display on nodes

### WorkflowRunner
- Profiling can be started/stopped independently of workflow execution
- Records node execution status alongside timing data

## Usage Example

```typescript
const PerformanceProfilerPanel: React.FC<{ workflowId: string }> = ({
  workflowId
}) => {
  const {
    isProfiling,
    bottlenecks,
    nodeRankings,
    startProfiling,
    endProfiling
  } = useWorkflowProfiler(workflowId);

  return (
    <PerformanceProfiler
      workflowId={workflowId}
      onNodeClick={(nodeId) => focusNode(nodeId)}
      onStartProfiling={() => analytics.track("profiling_started")}
      onEndProfiling={() => analytics.track("profiling_completed")}
    />
  );
};
```

## Performance Considerations

- **Memory**: Stores last 50 profiles per workflow (~1KB per profile)
- **Rendering**: Uses React.memo and selective Zustand subscriptions
- **Computation**: Bottleneck analysis runs only when profile changes

## Future Enhancements

- Export profiling data as JSON for external analysis
- Compare profiles across workflow versions
- Historical trend charts for repeated executions
- Customizable performance thresholds
- Integration with backend resource monitoring

## Files Created

- `web/src/stores/PerformanceProfilerStore.ts`
- `web/src/hooks/useWorkflowProfiler.ts`
- `web/src/components/profiler/PerformanceProfiler.tsx`
- `web/src/stores/__tests__/PerformanceProfilerStore.test.ts`
- `web/src/hooks/__tests__/useWorkflowProfiler.test.ts`
- `web/src/components/profiler/__tests__/PerformanceProfiler.test.tsx`

## Related Documentation

- `web/src/stores/AGENTS.md` - Store patterns and best practices
- `web/src/hooks/AGENTS.md` - Hook development guidelines
- `web/src/components/AGENTS.md` - Component architecture
