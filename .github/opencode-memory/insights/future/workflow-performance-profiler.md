# Workflow Performance Profiler (Experimental)

## Overview
Visual workflow performance profiling feature that helps users identify execution bottlenecks, understand node timing, and optimize their AI workflows.

## Status
**Experimental**: This is a research feature. API may change.

## Use Cases
- **Workflow Optimization**: Identify slow nodes that are bottlenecks
- **Debugging**: Understand execution order and parallelization
- **Research**: Track execution times for experiments
- **Cost Estimation**: Estimate costs based on model execution times

## How It Works

### Components
1. **PerformanceProfilerPanel** - Main floating panel with tabs for Summary and Timeline views
2. **PerformanceSummary** - Statistics cards showing total/parallel time, bottleneck detection
3. **PerformanceTimeline** - Gantt-style visualization of execution order
4. **PerformanceHeatmapOverlay** - Color-coded node indicators based on duration
5. **usePerformanceProfiler** - Hook that aggregates timing data from ExecutionTimeStore

### Data Flow
```
ExecutionTimeStore → usePerformanceProfiler → Performance Components
                              ↓
                    Summary | Timeline | Heatmap
```

### Key Files
- `web/src/hooks/usePerformanceProfiler.ts` - Main hook
- `web/src/components/performance/PerformanceProfilerPanel.tsx` - Main panel
- `web/src/components/performance/PerformanceSummary.tsx` - Summary stats
- `web/src/components/performance/PerformanceTimeline.tsx` - Timeline visualization
- `web/src/components/performance/PerformanceHeatmapOverlay.tsx` - Heatmap overlay

## Usage Example
```tsx
import { PerformanceProfilerPanel, usePerformanceProfiler } from '../components/performance';

const MyWorkflowEditor = ({ workflowId }) => {
  const { summary, timeline, formatDuration } = usePerformanceProfiler({
    workflowId,
    enabled: true
  });

  return (
    <>
      <NodeEditor />
      <PerformanceProfilerPanel
        workflowId={workflowId}
        defaultTab={0}
      />
    </>
  );
};
```

## Performance Metrics
- **Parallel Duration**: Wall-clock time from first to last node completion
- **Total CPU Time**: Sum of all node execution times
- **Bottleneck Detection**: Automatically identifies the slowest completed node
- **Completion Percentage**: Progress tracking during execution

## Limitations
- Requires ExecutionTimeStore integration with workflow execution
- Timeline visualization assumes sequential start times
- Heatmap colors are relative to max duration in current run
- No comparison with previous runs yet

## Future Improvements
- Historical comparison (vs. previous execution)
- Per-model cost estimation
- Export performance reports
- Custom threshold configuration
- Export to CSV/JSON for research analysis

## Feedback
Provide feedback via GitHub issues or the opencode agent system.
