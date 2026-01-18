# Workflow Performance Profiler (Experimental)

## Overview

A research feature that analyzes workflow structure to identify performance bottlenecks, parallelization opportunities, and provides optimization suggestions. This helps users understand how their workflows might perform and discover ways to improve efficiency.

## Status

⚠️ **Experimental**: This is a research feature. API may change based on user feedback and testing.

## Use Cases

- **Performance Optimization**: Identify slow-running nodes and bottlenecks
- **Workflow Analysis**: Understand the critical path through a workflow
- **Parallelization**: Discover which nodes can run simultaneously
- **Cost Management**: Identify expensive API calls that could be optimized
- **Debugging**: Find problematic patterns in workflow design

## How It Works

The profiler analyzes the workflow graph structure using:

1. **Topological Sorting**: Determines execution layers and parallelization opportunities
2. **Node Runtime Estimation**: Assigns estimated execution times based on node type
3. **Complexity Classification**: Categorizes nodes as low/medium/high complexity
4. **Bottleneck Detection**: Identifies nodes that may cause delays
5. **Suggestion Generation**: Provides actionable optimization recommendations

### Key Metrics

- **Estimated Runtime**: Predicted execution time based on node types
- **Parallelizable Layers**: Number of layers that can run in parallel
- **Critical Path**: Longest execution chain through the workflow
- **Bottleneck Score**: Nodes with highest complexity or blocking potential

## Usage Example

```typescript
import { WorkflowProfiler } from '../components/node_editor/WorkflowProfiler';
import { useWorkflowProfiler } from '../hooks/useWorkflowProfiler';

// Using the hook
const { profile, analyzeWorkflow } = useWorkflowProfiler(workflowId);

// Analyze a workflow
const result = analyzeWorkflow(nodes, edges);

// Access metrics
console.log(result.estimatedTotalRuntime);
console.log(result.criticalPath);
console.log(result.suggestions);

// Using the component
<WorkflowProfiler
  workflowId={workflowId}
  nodes={nodes}
  edges={edges}
  compact={false}
/>
```

## Architecture

### Files Created

- `web/src/stores/WorkflowProfilerStore.ts` - Zustand store for profiling data
- `web/src/hooks/useWorkflowProfiler.ts` - React hook for profiler functionality
- `web/src/components/node_editor/WorkflowProfiler.tsx` - UI component

### Data Flow

1. User opens profiler in workflow editor
2. `analyzeWorkflow()` is called with current nodes and edges
3. Topological sort determines execution layers
4. Each node is analyzed for complexity and bottlenecks
5. Profile is stored and displayed in UI

## Limitations

- Runtime estimates are approximate and based on node type heuristics
- Actual performance depends on hardware, model loading, and API latency
- Does not account for conditional branching complexity
- Suggestions are general guidelines, not guarantees

## Future Improvements

- Add historical profiling data tracking
- Integrate with actual execution metrics from runs
- Support comparing multiple workflow versions
- Add AI-powered optimization recommendations
- Include cost estimation for API-based nodes

## Feedback

To provide feedback on this feature:
1. Test in workflows of varying complexity
2. Report accuracy of runtime estimates
3. Share usefulness of optimization suggestions
4. Suggest additional metrics or visualizations

## Implementation Notes

### Performance Considerations

- Profiling is computed synchronously on the client
- For large workflows (>100 nodes), consider debouncing analysis
- Results are cached per workflow ID

### Integration Points

- Works with existing NodeStore for node data
- Uses topologicalSort from core/graph utilities
- Compatible with all node types
- No backend required for analysis
