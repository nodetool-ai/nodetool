# Workflow Performance Profiler (Experimental)

## Overview

A built-in performance profiling tool for NodeTool that helps users identify bottlenecks and optimize their AI workflow execution. The profiler tracks node execution times, visualizes performance data, and automatically detects performance issues.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Workflow Optimization**: Identify slow nodes that are bottlenecks in your workflow
- **Performance Comparison**: Compare execution times across different workflow versions
- **Resource Planning**: Understand which nodes consume the most time
- **Debugging**: Find unexpected performance issues in complex workflows

## How It Works

The profiler integrates with the existing execution tracking system:

1. **PerformanceProfilerStore** (`web/src/stores/PerformanceProfilerStore.ts`):
   - Tracks execution metrics per node (duration, calls, avg/min/max)
   - Automatically identifies bottlenecks (nodes > 1.5x average duration)
   - Stores historical profiling data for multiple workflows

2. **ProfilerPanel** (`web/src/components/node_editor/ProfilerPanel.tsx`):
   - Visual dashboard showing total duration, node count, and bottlenecks
   - Expandable node metrics with performance indicators
   - Color-coded performance levels (good/medium/poor)

3. **PerformanceOverlay** (`web/src/components/node/PerformanceOverlay.tsx`):
   - Visual indicators on nodes during/after execution
   - Shows duration and performance level
   - Hover for detailed metrics

4. **useWorkflowProfiler Hook** (`web/src/hooks/useWorkflowProfiler.ts`):
   - Easy integration for workflow components
   - Start/stop profiling
   - Record execution data

## Usage Example

```typescript
import { useWorkflowProfiler } from '../hooks/useWorkflowProfiler';

const MyWorkflowEditor = ({ workflowId }) => {
  const { isProfiling, startProfiling, stopProfiling, getProfile, getBottlenecks } = 
    useWorkflowProfiler({ workflowId, enabled: true });

  const handleRun = async () => {
    startProfiling();
    await runWorkflow();
    stopProfiling();
    
    const bottlenecks = getBottlenecks();
    if (bottlenecks.length > 0) {
      console.log('Performance issues found:', bottlenecks);
    }
  };

  return (
    <div>
      <button onClick={handleRun}>
        {isProfiling ? 'Recording...' : 'Run with Profiling'}
      </button>
    </div>
  );
};
```

## Limitations

- Currently tracks only execution time, not memory or CPU usage
- Bottleneck detection is based on simple duration thresholds
- No historical comparison between workflow versions
- No integration with workflow execution lifecycle yet

## Future Improvements

- Automatic profiling during every workflow execution
- Memory and CPU tracking
- Comparison with previous runs
- Export profiling data
- Integration with ResultsStore for richer analytics

## Feedback

To provide feedback on this feature:
1. Test with various workflow types
2. Report false positives/negatives in bottleneck detection
3. Suggest additional metrics to track
4. Share use cases where it helped optimize workflows

## Files Created

- `web/src/stores/PerformanceProfilerStore.ts` - Zustand store for profiling data
- `web/src/components/node_editor/ProfilerPanel.tsx` - Visual profiling dashboard
- `web/src/components/node/PerformanceOverlay.tsx` - Node-level performance indicators
- `web/src/hooks/useWorkflowProfiler.ts` - Integration hook
- `web/src/stores/__tests__/PerformanceProfilerStore.test.ts` - Unit tests
