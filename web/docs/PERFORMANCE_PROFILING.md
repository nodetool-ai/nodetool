# Performance Profiling (Experimental)

## Overview

Performance Profiling is an experimental feature that helps users analyze and optimize workflow performance by tracking execution times, identifying bottlenecks, and comparing runs over time.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Users**: Identify which nodes are slowest in their workflows
- **Developers**: Debug performance issues in complex workflows
- **Researchers**: Track performance metrics across experiments

## How It Works

The profiling system tracks execution time for each node across multiple workflow runs and provides:

1. **Per-Node Statistics**: Average, min, max duration per node
2. **Bottleneck Detection**: Automatic identification of slowest nodes
3. **Run Comparison**: Compare current run with historical averages
4. **Visual Heatmap**: Color-coded overlay showing relative performance

## Usage

### Basic Integration

```typescript
import { usePerformanceProfiler } from "../hooks/usePerformanceProfiler";

const workflowId = "my-workflow";
const workflowName = "Text Processing Pipeline";

const { onRunStart, onRunComplete, onNodeComplete } = usePerformanceProfiler({
  workflowId,
  workflowName,
  onBottleneckDetected: (nodeId, duration) => {
    console.log(`Slow node: ${nodeId} took ${duration}ms`);
  }
});

// Start profiling when workflow begins
onRunStart();

// Track each node as it completes
onNodeComplete("llm-node", 2500);
onNodeComplete("output-node", 150);

// When workflow completes
onRunComplete(5000);
```

### Using the Performance Panel

The Performance Panel provides a visual interface for viewing profiling data:

1. Open a workflow in the editor
2. Look for the Performance Panel in the right sidebar
3. Run the workflow to collect data
4. View metrics after completion

### Performance Heatmap

The heatmap overlay appears in the node editor showing:
- Top 5 slowest nodes
- Color-coded by relative duration
- Bottleneck alerts (⚠️ icon)

## API Reference

### usePerformanceProfiler Hook

```typescript
interface UsePerformanceProfilerOptions {
  workflowId: string;
  workflowName: string;
  onBottleneckDetected?: (nodeId: string, duration: number) => void;
}

interface UsePerformanceProfilerReturn {
  onRunStart: () => void;
  onRunComplete: (totalDuration: number) => void;
  onNodeComplete: (nodeId: string, duration: number) => void;
  getCurrentTimings: () => Record<string, number>;
}
```

### Performance Data Structure

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

## Limitations

- Data is stored in memory (cleared on page refresh)
- Maximum 20 runs history per node
- Requires manual integration with workflow execution
- No persistent storage across sessions

## Future Improvements

- Automatic integration with workflow runner
- Persistent storage of profiles
- Historical trend visualization
- Performance recommendations
- Export to CSV/JSON

## Feedback

Provide feedback via GitHub issues or the NodeTool Discord community.
