# Workflow Performance Profiler (Experimental)

## Overview
Analyzes workflow structure for potential bottlenecks, estimates execution time, identifies parallelizable nodes, and provides a performance score with visual indicators.

## Status
⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases
- **Users**: Understand workflow performance before running
- **Developers**: Identify optimization opportunities
- **Researchers**: Analyze workflow structure and dependencies

## How It Works
1. **Dependency Analysis**: Builds a dependency graph from node connections
2. **Duration Estimation**: Estimates execution time based on node type and complexity
3. **Parallel Detection**: Identifies nodes that can run in parallel using topological analysis
4. **Bottleneck Identification**: Highlights nodes that may slow down execution
5. **Scoring**: Calculates a performance score (0-100) based on node count, depth, and bottlenecks

## Key Components
- `WorkflowProfilerStore.ts`: Zustand store for analysis state and algorithms
- `useWorkflowProfiler.ts`: Hook for accessing analysis results
- `WorkflowProfiler.tsx`: UI component with expand/collapse panel
- `NodeEditor.tsx`: Integration point for displaying the profiler

## Technical Details

### Algorithm: Topological Sort for Parallelization
```typescript
// Nodes are assigned to levels based on their dependencies
// Nodes at the same level can run in parallel
const levels = new Map<number, string[]>();
nodes.forEach((node) => {
  const depth = calculateMaxDepth(node.id, dependencies);
  levels.get(depth)?.push(node.id) || levels.set(depth, [node.id]);
});
```

### Complexity Estimation
```typescript
// Base times per node category (in milliseconds)
const NODE_COMPLEXITY_ESTIMATES = {
  "nodetool.input": { baseTime: 10, complexity: "low" },
  "nodetool.llm": { baseTime: 2000, complexity: "high" },
  "nodetool.embedding": { baseTime: 500, complexity: "medium" },
  "nodetool.audio": { baseTime: 3000, complexity: "high" },
  // ... more categories
};
```

### Performance Score Formula
```typescript
const calculateComplexityScore = (nodeCount, maxDepth, bottleneckCount) => {
  let score = 100;
  score -= Math.min(nodeCount * 2, 40);      // Penalty for many nodes
  score -= Math.min(maxDepth * 5, 30);        // Penalty for deep graphs
  score -= Math.min(bottleneckCount * 10, 30); // Penalty for bottlenecks
  return Math.max(0, Math.min(100, score));
};
```

## Limitations
- Estimates are based on node type, not actual execution time
- Doesn't account for model loading time
- Assumes single-threaded sequential execution by default
- Complexity estimates may not reflect actual performance

## Future Improvements
- Add actual execution time tracking from completed runs
- Support for custom node timing profiles
- Integration with node metadata for better estimates
- Export performance reports
- Compare current run times with estimates

## Files
- `web/src/stores/WorkflowProfilerStore.ts`
- `web/src/hooks/useWorkflowProfiler.ts`
- `web/src/components/profiler/WorkflowProfiler.tsx`
- `web/src/components/node_editor/NodeEditor.tsx`

## Feedback
Provide feedback via GitHub issues or the NodeTool community.
