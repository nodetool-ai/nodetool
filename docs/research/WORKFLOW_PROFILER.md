# Workflow Performance Profiler (Experimental)

## Overview

The **Workflow Performance Profiler** is an experimental feature that analyzes workflow execution performance, identifies bottlenecks, and provides optimization suggestions. It helps researchers and developers understand how their workflows perform and where improvements can be made.

## Status

⚠️ **Experimental**: This is a research feature. API may change based on user feedback.

## Use Cases

- **Researchers**: Understand performance characteristics of AI workflows
- **Developers**: Identify slow nodes and optimization opportunities
- **Power Users**: Optimize workflows for faster execution

## How It Works

1. **Data Collection**: The profiler collects execution timing data from `ExecutionTimeStore` for each node during workflow runs
2. **Graph Analysis**: Uses topological sort to analyze the workflow graph structure
3. **Metrics Calculation**: Calculates total duration, parallelization efficiency, and identifies bottlenecks
4. **Suggestions**: Generates actionable optimization suggestions based on patterns

### Key Metrics

- **Total Duration**: Sum of all node execution times
- **Estimated Parallel Time**: Theoretical minimum time if all parallel nodes executed simultaneously
- **Efficiency**: Ratio of parallel time to total time (higher = better)
- **Bottleneck Nodes**: Nodes taking >10% of total execution time
- **Graph Depth**: Number of sequential layers in the workflow
- **Parallelizable Paths**: Number of branches that could run in parallel

## Usage Example

```typescript
import WorkflowProfiler from "./components/node_editor/WorkflowProfiler";

// In your NodeEditor or panel component:
<WorkflowProfiler
  workflowId={workflowId}
  nodes={nodes}
  edges={edges}
  onNodeClick={(nodeId) => focusNode(nodeId)}
/>
```

## Technical Details

### Files

- `web/src/stores/WorkflowProfilerStore.ts` - Store and analysis logic
- `web/src/components/node_editor/WorkflowProfiler.tsx` - UI component
- `web/src/stores/__tests__/WorkflowProfilerStore.test.ts` - Unit tests

### Dependencies

- Uses existing `ExecutionTimeStore` for timing data
- Uses `topologicalSort` from `core/graph.ts` for graph analysis
- Works with existing ReactFlow nodes and edges

### Metrics Calculation

```typescript
// Total duration = sum of all node execution times
const totalDuration = nodeTimings.reduce((sum, n) => sum + (n.duration || 0), 0);

// Efficiency = parallel time / total time * 100
const efficiency = (estimatedParallelTime / totalDuration) * 100;

// Bottleneck = nodes taking >10% of total time
const bottlenecks = nodeTimings.filter(n => n.duration >= totalDuration * 0.1);
```

## Limitations

- **Requires execution data**: Must run workflow at least once for meaningful analysis
- **Sequential timing**: Doesn't capture actual parallel execution timing
- **Simple heuristics**: Suggestions are based on simple patterns, not deep analysis
- **No caching**: Report is recalculated on each analyze call

## Future Improvements

- Store historical performance data across runs
- Compare performance across different inputs
- Integration with resource monitoring (memory, CPU)
- AI-powered optimization suggestions
- Export performance reports

## Feedback

Provide feedback via GitHub issues or the OpenCode agent system.
