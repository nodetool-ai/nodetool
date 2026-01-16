# Workflow Performance Profiler (Experimental)

## Overview

The Workflow Performance Profiler is an experimental feature that provides detailed performance metrics for workflow execution. It helps users identify bottlenecks, understand execution patterns, and optimize their AI workflows.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Users**: Identify slow nodes in workflows and optimize performance
- **Developers**: Debug performance issues and validate optimizations
- **Researchers**: Analyze execution patterns and compare workflow variants

## How It Works

The profiler automatically captures timing data during workflow execution:

1. **Workflow-level timing**: Tracks total workflow duration from start to completion
2. **Node-level timing**: Records execution time for each node individually
3. **Bottleneck detection**: Identifies the slowest nodes in a workflow
4. **Statistics aggregation**: Calculates averages, totals, and node counts

### Data Collection

The profiler integrates with the existing workflow execution pipeline:
- Captures timing data from `ExecutionTimeStore`
- Tracks status changes to identify start/end of node execution
- Aggregates data in `ProfilingStore`

### Display

The `ProfilerPanel` component displays:
- Total workflow execution time
- Average time per node
- Slowest node identification
- Visual duration bars for each node
- Bottleneck highlights

## Usage Example

```typescript
import useProfiling from "../hooks/useProfiling";

const MyComponent: React.FC = () => {
  const { getStatistics, getSlowestNodes, getProfile } = useProfiling();

  const workflowId = "my-workflow-id";
  const stats = getStatistics(workflowId);
  const slowestNodes = getSlowestNodes(workflowId, 3);

  if (!stats) {
    return <div>No profiling data available</div>;
  }

  return (
    <div>
      <h2>Performance Statistics</h2>
      <p>Total time: {stats.totalDuration}ms</p>
      <p>Nodes: {stats.nodeCount}</p>
      <p>Average per node: {stats.averageDuration}ms</p>

      <h3>Bottlenecks</h3>
      {slowestNodes.map(node => (
        <div key={node.nodeId}>
          {node.title}: {node.duration}ms
        </div>
      ))}
    </div>
  );
};
```

## API Reference

### ProfilingStore

```typescript
interface WorkflowProfile {
  workflowId: string;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  nodeProfiles: Record<string, NodeProfile>;
  criticalPath: string[];
  slowestNodes: string[];
  fastestNodes: string[];
}

interface NodeProfile {
  nodeId: string;
  nodeType: string;
  title: string;
  duration: number;
  startTime: number;
  endTime: number;
  status: string;
}

interface ProfilingStore {
  startProfiling: (workflowId: string) => void;
  endProfiling: (workflowId: string) => void;
  addNodeProfile: (workflowId: string, profile: NodeProfile) => void;
  getProfile: (workflowId: string) => WorkflowProfile | undefined;
  clearProfile: (workflowId: string) => void;
  getNodeDuration: (workflowId: string, nodeId: string) => number | undefined;
  getSlowestNodes: (workflowId: string, limit?: number) => NodeProfile[];
  getStatistics: (workflowId: string) => {
    totalDuration: number;
    nodeCount: number;
    averageDuration: number;
    slowestNode: NodeProfile | null;
    fastestNode: NodeProfile | null;
  } | null;
}
```

### useProfiling Hook

```typescript
const {
  isProfiling,
  currentWorkflowId,
  startProfiling,
  endProfiling,
  recordNodeExecution,
  getProfile,
  clearProfile,
  getNodeDuration,
  getSlowestNodes,
  getStatistics,
} = useProfiling();
```

## Integration Points

1. **workflowUpdates.ts**: Automatic profiling capture during execution
2. **ProfilerPanel.tsx**: UI component for displaying results
3. **BaseNode.tsx**: Can optionally show inline timing (future enhancement)

## Limitations

- Data is not persisted across sessions
- No historical comparison between runs
- Critical path analysis is basic
- No memory or resource usage tracking
- Profiling adds minimal overhead (~1ms per update)

## Future Improvements

- [ ] Persist profiles across sessions
- [ ] Compare multiple workflow runs
- [ ] Export profiling data (JSON/CSV)
- [ ] Visual timeline/gantt chart view
- [ ] Memory and resource usage tracking
- [ ] AI-powered optimization suggestions
- [ ] Integration with backend profiling data

## Feedback

To provide feedback on this feature:
1. Open an issue at https://github.com/nodetool-ai/nodetool/issues
2. Label with "profiler" and "experimental"
3. Include your use case and any suggestions
