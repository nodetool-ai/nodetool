# Workflow Performance Profiling Feature

**Insight**: Implemented a comprehensive performance profiling system for NodeTool workflows that tracks execution metrics, identifies bottlenecks, and visualizes performance data.

**Rationale**: Users need visibility into workflow performance to optimize their AI pipelines. This feature builds on existing execution time tracking to provide rich performance analytics.

**Implementation Components**:

1. **PerformanceProfilerStore** (`web/src/stores/PerformanceProfilerStore.ts`)
   - Tracks timing statistics across multiple runs per node
   - Stores min/max/avg durations for each node
   - Maintains history of last 20 runs per node
   - Automatically identifies top 5 bottleneck nodes
   - Provides comparison with previous runs

2. **PerformanceProfiler Component** (`web/src/components/performance/PerformanceProfiler.tsx`)
   - Visual display of performance metrics
   - Expandable node details showing avg/min/max/run counts
   - Bottleneck warnings with quick navigation
   - Performance comparison vs previous runs
   - Color-coded progress bars for duration visualization

3. **PerformanceHeatmap Component** (`web/src/components/performance/PerformanceHeatmap.tsx`)
   - Overlay panel showing top 5 slowest nodes
   - Color-coded indicators (green/yellow/red) based on duration
   - Real-time bottleneck alerts

4. **PerformancePanel Component** (`web/src/components/performance/PerformancePanel.tsx`)
   - Dockable panel for the full profiler interface
   - Export profile data to JSON
   - Clear profile functionality

5. **usePerformanceProfiler Hook** (`web/src/hooks/usePerformanceProfiler.ts`)
   - Easy integration with workflow execution
   - Callback-based API for tracking node completion

**Example Usage**:
```typescript
const { onRunStart, onRunComplete, onNodeComplete } = usePerformanceProfiler({
  workflowId: workflow.id,
  workflowName: workflow.name,
  onBottleneckDetected: (nodeId, duration) => {
    notificationStore.addNotification(`Slow node detected: ${nodeId}`);
  }
});

// Call on workflow start
onRunStart();

// Call when each node completes
onNodeComplete(nodeId, duration);

// Call when entire workflow completes
onRunComplete(totalDuration);
```

**Data Model**:
```typescript
interface NodePerformanceData {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  durations: number[];        // Last 20 runs
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  lastDuration: number;
  executionCount: number;
}

interface WorkflowPerformanceProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeData: Record<string, NodePerformanceData>;
  bottlenecks: string[];      // Top 5 slowest node IDs
  timestamp: number;
  runCount: number;
}
```

**Integration Points**:
- Uses existing `ExecutionTimeStore` for timing data
- Integrates with `useNodes` from `NodeContext` for node labels
- Works with any workflow execution system

**Impact**: Users can now:
- See which nodes are slowest in their workflows
- Track performance changes across multiple runs
- Identify optimization opportunities
- Export performance data for analysis

**Files Created**:
- `web/src/stores/PerformanceProfilerStore.ts`
- `web/src/stores/__tests__/PerformanceProfilerStore.test.ts`
- `web/src/components/performance/PerformanceProfiler.tsx`
- `web/src/components/performance/PerformanceHeatmap.tsx`
- `web/src/components/performance/PerformancePanel.tsx`
- `web/src/components/performance/__tests__/PerformanceProfiler.test.tsx`
- `web/src/hooks/usePerformanceProfiler.ts`

**Date**: 2026-01-16
