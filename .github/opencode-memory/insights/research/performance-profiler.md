# Workflow Performance Profiler Implementation

## Overview

This document describes the implementation of the Workflow Performance Profiler, a research feature for analyzing workflow execution performance.

## Architecture

### Components

1. **PerformanceProfilerStore** (`web/src/stores/PerformanceProfilerStore.ts`)
   - Zustand store for tracking node execution metrics
   - Records start/end times, memory estimates, I/O wait, compute estimates
   - Generates performance reports with bottleneck detection
   - Calculates performance scores (0-100)

2. **PerformanceProfilerPanel** (`web/src/components/node_editor/PerformanceProfilerPanel.tsx`)
   - Floating panel displaying performance metrics
   - Real-time execution timeline visualization
   - Score gauge with color-coded feedback
   - Bottleneck list with severity indicators
   - Optimization suggestions

3. **PerformanceProfilerToggleButton** (`web/src/components/node_editor/PerformanceProfilerToggleButton.tsx`)
   - Button to toggle profiler panel visibility
   - Shows bottleneck count badge

4. **usePerformanceProfiler Hook** (`web/src/hooks/usePerformanceProfiler.ts`)
   - React hook for integrating profiler with workflows
   - Manages panel visibility state

### Key Features

- **Execution Timing**: Records start/end times for each node
- **Memory Estimation**: Estimates memory usage based on node type
- **Compute Estimation**: Estimates compute intensity based on node type
- **I/O Wait Tracking**: Tracks I/O wait times
- **Bottleneck Detection**: Identifies slow nodes and high-memory usage
- **Performance Score**: Calculates overall workflow performance (0-100)
- **Optimization Suggestions**: Provides actionable recommendations
- **Execution Timeline**: Visual timeline of node execution

## Usage

```typescript
// In a workflow component
const { showProfiler, toggleProfiler, report } = usePerformanceProfiler(
  workflowId,
  nodeTypes
);

// Record node start
recordNodeStart(nodeId, nodeType, nodeName, position);

// Record node completion
recordNodeComplete(nodeId, { ioWaitMs: 100 });

// Render profiler panel
<PerformanceProfilerPanel
  workflowId={workflowId}
  nodeTypes={nodeTypes}
  isOpen={showProfiler}
  onClose={toggleProfiler}
/>
```

## Data Model

### NodePerformanceMetrics
```typescript
interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  startTime: number;
  memoryEstimateMB: number;
  computeEstimate: number;
  ioWaitMs: number;
  status: "pending" | "running" | "completed" | "error";
  position: { x: number; y: number };
}
```

### WorkflowPerformanceReport
```typescript
interface WorkflowPerformanceReport {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  errorCount: number;
  metrics: NodePerformanceMetrics[];
  bottlenecks: PerformanceBottleneck[];
  score: number;
  parallelizationOpportunities: ParallelizationOpportunity[];
}
```

## Performance Score Calculation

Score starts at 100 and is reduced based on:
- High severity bottlenecks: -20 points each
- Medium severity bottlenecks: -10 points each
- Low severity bottlenecks: -5 points each
- Error nodes: -15 points each

Final score is clamped between 0 and 100.

## Bottleneck Detection

Nodes are flagged as bottlenecks when:
- Duration > 50% of max node duration AND > 1 second
- Memory usage > 2GB (medium severity)
- Memory usage > 4GB (high severity)

## Node Type Defaults

| Node Type | Memory (MB) | Compute |
|-----------|-------------|---------|
| LLM | 2048 | 80 |
| ImageGeneration | 4096 | 95 |
| AudioProcessing | 1024 | 60 |
| TextProcessing | 512 | 30 |
| VectorStore | 1536 | 40 |
| Function | 256 | 20 |
| Input | 128 | 5 |
| Output | 128 | 5 |
| Condition | 64 | 3 |
| Loop | 256 | 25 |
| Default | 256 | 20 |

## Limitations

- Estimates are based on node type, not actual runtime metrics
- Memory/compute estimates are static per node type
- I/O wait must be manually recorded
- No integration with actual backend metrics

## Future Improvements

- Real memory/CPU metrics from backend
- Historical performance comparison
- Automatic optimization suggestions
- Export performance reports
- Integration with node properties for custom estimates
