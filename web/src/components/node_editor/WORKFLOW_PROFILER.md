# Workflow Performance Profiler (Experimental)

## Overview

The Workflow Performance Profiler is an experimental feature that analyzes workflow execution timing data to identify performance bottlenecks, provide statistics, and offer optimization suggestions. It helps users understand where their workflows spend the most time and how to optimize them.

## Status

⚠️ **Experimental**: This is a research feature. API may change based on user feedback.

## Use Cases

- **Performance Optimization**: Identify which nodes are slowing down your workflows
- **Debugging**: Find unexpected performance issues in complex workflows
- **Best Practices**: Learn optimization patterns through actionable suggestions
- **Comparison**: Track performance over multiple workflow runs

## How It Works

### Data Collection

The profiler leverages the existing `ExecutionTimeStore` which tracks start and end timestamps for each node execution during workflow runs. This data is collected automatically and requires no additional configuration.

### Analysis Process

When you click "Analyze Performance" in the profiler panel:

1. **Data Aggregation**: Collects timing data from `ExecutionTimeStore` for all nodes in the workflow
2. **Statistics Calculation**: Computes total duration, average node duration, and identifies the slowest nodes
3. **Bottleneck Detection**: Identifies nodes that account for significant execution time (default threshold: 30% of slowest node)
4. **Suggestion Generation**: Creates actionable recommendations based on the analysis

### Performance Metrics

| Metric | Description |
|--------|-------------|
| **Total Time** | Sum of all node execution times |
| **Avg per Node** | Average execution time across all completed nodes |
| **Nodes Run** | Count of completed vs. total nodes |
| **Bottlenecks** | Number of identified performance bottlenecks |

## Usage Example

```typescript
import WorkflowProfilerPanel from './components/node_editor/WorkflowProfilerPanel';

// Add to NodeEditor layout
<WorkflowProfilerPanel workflowId={currentWorkflowId} />

// Or use the store directly for custom implementations
import useWorkflowProfilerStore from './stores/WorkflowProfilerStore';

const store = useWorkflowProfilerStore();
store.analyzeWorkflow('workflow-123');
const profile = store.getProfile('workflow-123');
const suggestions = store.getSuggestions('workflow-123');
```

## API Reference

### WorkflowProfilerStore

```typescript
interface WorkflowProfilerStore {
  // Get cached profile for a workflow
  getProfile(workflowId: string): WorkflowProfile | null;

  // Get optimization suggestions for a workflow
  getSuggestions(workflowId: string): PerformanceSuggestion[];

  // Analyze workflow and generate profile
  analyzeWorkflow(workflowId: string): WorkflowProfile;

  // Clear profile data for a workflow
  clearProfile(workflowId: string): void;

  // Clear all profile data
  clearAllProfiles(): void;
}
```

### WorkflowProfile

```typescript
interface WorkflowProfile {
  workflowId: string;
  totalDuration: number;        // Total execution time in ms
  nodeCount: number;            // Total nodes in workflow
  completedNodes: number;       // Nodes with timing data
  averageNodeDuration: number;  // Average per-node execution time
  slowestNode: NodeProfile | null;
  bottlenecks: NodeProfile[];   // Top bottleneck nodes
  parallelizableNodes: string[]; // Nodes that could run in parallel
  startTime: number;            // Workflow start timestamp
  endTime: number;              // Workflow end timestamp
}

interface NodeProfile {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number;
  percentage: number;           // Relative to slowest node
  isBottleneck: boolean;
}
```

### PerformanceSuggestion

```typescript
interface PerformanceSuggestion {
  type: 'warning' | 'info' | 'success';
  message: string;
  impact: 'high' | 'medium' | 'low';
  nodeIds?: string[];           // Affected node IDs
}
```

## Limitations

1. **No Historical Data**: Currently only analyzes the most recent execution
2. **Frontend-Only**: Does not collect server-side timing metrics
3. **Threshold Fixed**: Bottleneck detection uses fixed 30% threshold
4. **No Comparison**: Cannot compare across multiple workflow runs
5. **Partial Node Coverage**: Only shows nodes that have completed execution

## Future Improvements

- Historical performance tracking and comparison
- Customizable bottleneck thresholds
- Server-side timing metrics integration
- Export performance reports
- Integration with workflow templates for best practices

## Feedback

To provide feedback on this feature:

1. Report issues through GitHub issues
2. Submit feature requests for additional metrics
3. Share optimization patterns that worked well

## Related Files

- `web/src/stores/WorkflowProfilerStore.ts` - Store implementation
- `web/src/components/node_editor/WorkflowProfilerPanel.tsx` - UI component
- `web/src/stores/ExecutionTimeStore.ts` - Timing data source
- `web/src/stores/__tests__/WorkflowProfilerStore.test.ts` - Tests
