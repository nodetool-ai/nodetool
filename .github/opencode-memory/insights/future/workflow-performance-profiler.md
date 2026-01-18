# Workflow Performance Profiler (Experimental)

## Overview

The Workflow Performance Profiler is an experimental feature that analyzes NodeTool workflows for performance bottlenecks, parallelization opportunities, and structural issues. It helps users identify optimization opportunities in their AI workflows.

## Status

⚠️ **Experimental**: This is a research feature. API may change based on user feedback and testing.

## Use Cases

- **Performance Optimization**: Identify nodes with long execution times that slow down workflows
- **Parallelization Analysis**: Discover layers of nodes that could run concurrently
- **Structural Validation**: Detect cycles, orphan nodes, deep nesting, and redundant connections
- **Workflow Health**: Get an overall assessment of workflow structure quality

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WorkflowProfilerPanel                     │
│  (React component displaying profiling results)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    useWorkflowProfiler                       │
│  (React hook integrating store with component)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 WorkflowProfilerStore                        │
│  (Zustand store managing profiling data and analysis)       │
└─────────────────────────────────────────────────────────────┘
          │               │               │
          ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ Metrics      │ │ Bottlenecks  │ │ Structural   │
   │ Calculator   │ │ Detector     │ │ Issue Finder │
   └──────────────┘ └──────────────┘ └──────────────┘
```

### Key Components

1. **WorkflowProfilerStore** (`web/src/stores/WorkflowProfilerStore.ts`)
   - Manages profiling data for multiple workflows
   - Implements analysis algorithms:
     - Topological sort for layer detection
     - Bottleneck identification based on execution times
     - Parallel opportunity detection
     - Structural issue detection (cycles, orphans, deep nesting, redundancies)

2. **useWorkflowProfiler** (`web/src/hooks/useWorkflowProfiler.ts`)
   - React hook for easy integration with components
   - Provides `analyze()`, `clearProfile()`, `getExecutionTimeStats()`
   - Integrates with `ExecutionTimeStore` for execution data

3. **WorkflowProfilerPanel** (`web/src/components/node_editor/WorkflowProfilerPanel.tsx`)
   - UI component for displaying profiling results
   - Shows metrics, bottlenecks, parallel opportunities, and structural issues
   - Interactive elements: focus node on click, expand/collapse sections

### Analysis Algorithms

#### Topological Sort & Layer Detection
```typescript
// Uses Kahn's algorithm to detect layers
const topologicalSort = (nodes, edges) => {
  const indegree = {};
  const adjacency = {};
  // ... calculate indegrees and adjacency
  // ... BFS to extract layers
  return { layers, hasCycle };
};
```

#### Bottleneck Detection
```typescript
// Identifies nodes with execution time > 2x average
const detectBottlenecks = (nodes, executionTimes) => {
  // Filter nodes with execution time >= 2 * avg AND > 100ms
  // Calculate impact score (node time / max time)
  // Generate recommendations based on severity
};
```

#### Parallel Opportunity Detection
```typescript
// Finds layers with multiple nodes (can run in parallel)
const detectParallelOpportunities = (layers) => {
  return layers.filter(layer => layer.length > 1);
};
```

#### Structural Issue Detection
```typescript
// Detects: cycles, orphan nodes, deep nesting, redundant edges
const detectStructuralIssues = (nodes, edges, hasCycle) => {
  // Cycle detection from topological sort
  // Orphan detection (nodes not in any edge)
  // Deep nesting detection (parent chains > 3 levels)
  // Redundant edge detection (duplicate source-target pairs)
};
```

## Usage Example

```typescript
import { WorkflowProfilerPanel } from './components/node_editor/WorkflowProfilerPanel';
import { useWorkflowProfiler } from './hooks/useWorkflowProfiler';

// In a component:
const { profile, analyze } = useWorkflowProfiler({
  workflowId: workflow.id,
  nodes: nodes,
  edges: edges,
});

// Or use the panel directly:
<WorkflowProfilerPanel
  workflowId={workflow.id}
  nodes={nodes}
  edges={edges}
  onNodeFocus={(nodeId) => focusNode(nodeId)}
/>
```

## Metrics Explained

| Metric | Description | Range |
|--------|-------------|-------|
| Node Count | Total number of nodes in workflow | 0 - ∞ |
| Edge Count | Total number of connections | 0 - ∞ |
| Depth | Number of layers (longest path) | 0 - ∞ |
| Width | Maximum nodes in any layer | 0 - ∞ |
| Parallelizable Layers | Layers with 2+ nodes | 0 - depth |
| Density | Edge-to-node ratio | 0 - ∞ |
| Cycle Count | Number of nodes in cycles | 0 - nodeCount |

## Limitations

1. **Execution Data Required**: Bottleneck detection requires at least one workflow execution with timing data
2. **Static Analysis**: Structural analysis is based on graph topology, not runtime behavior
3. **No Recommendations Engine**: Current recommendations are rule-based, not ML-powered
4. **Single Workflow Scope**: Analysis is per-workflow, not cross-workflow comparison
5. **No Persistence**: Profiles are lost on page refresh (could be extended to localStorage)

## Future Improvements

1. **Historical Analysis**: Track profiling data across multiple workflow runs
2. **Comparison Mode**: Compare current profile with previous runs
3. **AI Recommendations**: Use ML to generate optimization suggestions
4. **Export Options**: Export profile data to JSON/CSV for external analysis
5. **Integration with Backend**: Server-side profiling for larger workflows
6. **Real-time Profiling**: Live updates during workflow execution

## Integration Points

- **ExecutionTimeStore**: Reads execution timing data
- **NodeStore**: Access to nodes and edges for analysis
- **StatusStore**: Could integrate execution status data
- **NodeFocusStore**: For focusing nodes from profiler panel

## Testing

Tests cover:
- ✅ Profile creation and retrieval
- ✅ Bottleneck detection with various execution times
- ✅ Parallel opportunity identification
- ✅ Structural issue detection (all 4 types)
- ✅ Store operations (clear, clearAll)
- ✅ Hook integration with stores

## Feedback

To provide feedback on this feature:
1. Test the WorkflowProfilerPanel in your workflows
2. Note any false positives/negatives in bottleneck detection
3. Report missing structural issue types
4. Suggest improvements to the UI/UX
