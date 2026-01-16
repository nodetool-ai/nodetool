# Workflow Profiler Implementation Insights

## Overview

Implemented a workflow performance profiler as an experimental research feature. This tool analyzes workflow graphs to identify performance bottlenecks, complexity issues, and optimization opportunities.

## Key Implementation Details

### Data Flow

```
Nodes/Edges → analyzeWorkflow() → WorkflowProfile → UI Component
```

### Core Analysis Functions

1. **Complexity Scoring** (`getNodeComplexity`)
   - Base weights per node type (input=1, model=5, llm=5, etc.)
   - Multipliers for configuration options (model_id, temperature, batch_size)
   - Final score: (totalComplexity + edges * 0.5 + maxDepth * 2) / 10

2. **Depth Calculation** (`calculateMaxDepth`)
   - Uses Kahn's algorithm for topological sorting
   - Calculates maximum execution path length
   - Important for identifying deep chains that could be parallelized

3. **Cycle Detection** (`detectCycles`)
   - DFS-based cycle detection
   - Critical for preventing infinite loops during execution
   - Returns the cycle path for debugging

### Graph Metrics Computed

| Metric | Description |
|--------|-------------|
| Density | (2 * edges) / (nodes * (nodes - 1)) |
| Avg Connections/Node | (edges * 2) / nodes |
| Fan-in/Fan-out | Max input/output connections per node |
| Source/Sink Nodes | Nodes with no inputs/outputs |
| Isolated Nodes | Disconnected from main workflow |

### Bottleneck Detection

The profiler identifies:
- Deep workflows (>10 levels)
- High fan-in nodes (>10 inputs)
- High fan-out nodes (>10 outputs)
- Cycles in the graph
- Model-heavy workflows (>3 model nodes)

## Technical Challenges

### Type System Issues

- `@xyflow/react` `Node` type is not generic (unlike newer versions)
- Solution: Use `ReactFlowNode` type alias and type assertions for data access
- Pattern: `const dataAny = data as Record<string, unknown>`

### React Integration

- Zustand store for profiler state management
- Integration with NodeContext for accessing nodes/edges
- Auto-profile toggle for real-time analysis

## Lessons Learned

1. **CSS-in-JS Pattern**: Using function-based style objects with Emotion
   ```typescript
   const styles = {
     container: (theme) => css({ padding: theme.spacing(2) })
   };
   ```

2. **Performance Considerations**: Analysis is computed synchronously
   - For large workflows, consider web worker or debounced computation
   - Current approach suitable for typical workflows (<100 nodes)

3. **Error Handling**: Graceful degradation when analysis fails
   - Store catches errors and resets analyzing state

## Files Modified/Created

| File | Purpose |
|------|---------|
| `web/src/core/workflowProfiler.ts` | Core analysis algorithms |
| `web/src/stores/WorkflowProfilerStore.ts` | Zustand state management |
| `web/src/components/panels/WorkflowProfilerPanel.tsx` | UI component |

## Future Improvements

- Add performance history tracking across runs
- Implement automated optimization suggestions
- Add comparison with previous workflow versions
- Support for custom complexity weights per node type
- Integration with execution profiling data
