# Workflow Performance Profiler (Experimental)

## Overview

The **Workflow Performance Profiler** is an experimental research feature that analyzes workflow execution performance, identifies bottlenecks, and provides optimization suggestions. It helps users understand how their workflows perform and discover opportunities for improvement.

## Status

⚠️ **Experimental**: This is a research feature. API and UI may change based on user feedback.

## Use Cases

- **Developers**: Identify slow nodes and optimize workflow performance
- **Researchers**: Analyze execution patterns and compare workflow efficiency
- **Users**: Understand workflow execution time breakdown and identify optimization opportunities

## How It Works

The profiler collects timing data from the existing `ExecutionTimeStore` and `StatusStore`, then analyzes:

1. **Total Execution Time**: Overall workflow runtime
2. **Node-level Timing**: Individual node execution durations
3. **Bottleneck Detection**: Identifies nodes consuming the most time
4. **Completion Metrics**: Tracks successful/failed/pending node counts
5. **Optimization Suggestions**: Finds parallelizable nodes and potential time savings

### Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│              PerformanceProfilerStore                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ analyzeWorkflow()                                 │  │
│  │ - Collects timing from ExecutionTimeStore         │  │
│  │ - Gets status from StatusStore                    │  │
│  │ - Calculates metrics and identifies bottlenecks   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              PerformanceProfiler Component               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ - Metric Cards (Total Time, Completion, etc.)     │  │
│  │ - Bottleneck Visualization (progress bars)        │  │
│  │ - Optimization Opportunities (expandable groups)  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Right Panel Integration                     │
│  - Toggle with P key or toolbar button                  │
│  - Persisted panel state                                │
│  - Works with existing panel infrastructure             │
└─────────────────────────────────────────────────────────┘
```

## Usage

### Opening the Profiler

1. **Keyboard Shortcut**: Press `P` to toggle the Performance Profiler panel
2. **Toolbar Button**: Click the Speed icon (⚡) in the right panel toolbar

### Interpreting Results

#### Metric Cards

| Metric | Description |
|--------|-------------|
| **Total Time** | Total workflow execution duration |
| **Completion** | Percentage of nodes that completed successfully |
| **Avg Node** | Average execution time per node |
| **Throughput** | Nodes completed per second |

#### Bottleneck Severity Levels

| Severity | Color | Threshold |
|----------|-------|-----------|
| **Critical** | Red | ≥50% of total time |
| **High** | Orange | ≥25% of total time |
| **Medium** | Blue | ≥10% of total time |
| **Low** | Green | <10% of total time |

## Code Example

```typescript
import { PerformanceProfiler } from "./components/node_editor/PerformanceProfiler";
import { usePerformanceProfiler } from "./hooks/usePerformanceProfiler";

// Using the hook in a component
const WorkflowAnalysis = ({ workflowId }) => {
  const { profile, refresh } = usePerformanceProfiler(workflowId);

  if (!profile) {
    return <div>Run workflow to see analysis</div>;
  }

  return (
    <div>
      <h2>Total Time: {profile.totalDuration}ms</h2>
      <h3>Bottlenecks:</h3>
      {profile.bottleneckNodes.map(node => (
        <div key={node.nodeId}>
          {node.nodeLabel}: {node.duration}ms ({node.percentageOfTotal}%)
        </div>
      ))}
      <button onClick={refresh}>Refresh Analysis</button>
    </div>
  );
};

// Using the component in JSX
<PerformanceProfiler workflowId="my-workflow-id" />
```

## API Reference

### PerformanceProfilerStore

```typescript
interface PerformanceProfilerStore {
  profile: PerformanceMetrics | null;
  isAnalyzing: boolean;
  lastAnalyzedAt: number | null;

  analyzeWorkflow: (workflowId: string, nodes: Node[]) => void;
  clearProfile: () => void;
  getNodeTiming: (workflowId: string, nodeId: string) => number | undefined;
}

interface PerformanceMetrics {
  totalDuration: number;
  nodeCount: number;
  completedNodeCount: number;
  failedNodeCount: number;
  pendingNodeCount: number;
  averageNodeDuration: number;
  bottleneckNodes: BottleneckNode[];
  parallelizableNodes: ParallelizableGroup[];
  metrics: {
    throughput: number;
    efficiency: number;
    concurrencyScore: number;
  };
}

interface BottleneckNode {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number;
  percentageOfTotal: number;
  severity: "critical" | "high" | "medium" | "low";
}

interface ParallelizableGroup {
  nodes: { nodeId: string; nodeLabel: string; duration: number }[];
  potentialSavings: number;
  description: string;
}
```

### usePerformanceProfiler Hook

```typescript
const {
  profile,        // PerformanceMetrics | null
  isAnalyzing,    // boolean
  lastAnalyzedAt, // number | null
  analyze,        // () => void
  refresh,        // () => void
  clearProfile,   // () => void
  getNodeTiming,  // (nodeId: string) => number | undefined
} = usePerformanceProfiler(workflowId);
```

## Limitations

- **Timing Data**: Requires at least one workflow execution to generate analysis
- **Node Types**: Only analyzes nodes with timing data (completed or in-progress)
- **Parallelization**: Suggestions are based on node type similarity, not actual parallelization capability
- **Historical Data**: Currently shows only the most recent execution data

## Future Improvements

- [ ] Historical performance tracking across multiple executions
- [ ] Comparison between workflow versions
- [ ] AI-powered optimization suggestions
- [ ] Export performance reports
- [ ] Integration with cost estimation (for paid models)
- [ ] Real-time profiling during execution

## Files

- `web/src/stores/PerformanceProfilerStore.ts` - Store for performance analysis
- `web/src/components/node_editor/PerformanceProfiler.tsx` - Visualization component
- `web/src/components/node_editor/ProfilerPanel.tsx` - Panel wrapper
- `web/src/hooks/usePerformanceProfiler.ts` - React hook for easy access
- `web/src/stores/__tests__/PerformanceProfilerStore.test.ts` - Store tests
- `web/src/components/node_editor/__tests__/PerformanceProfiler.test.tsx` - Component tests

## Feedback

To provide feedback on this feature:
1. Open an issue at https://github.com/nodetool-ai/nodetool/issues
2. Label with "performance-profiler" and "research-feature"
3. Include your use case and suggestions for improvement
