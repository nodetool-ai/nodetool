# Workflow Performance Profiler (Experimental)

## Overview

The **Workflow Performance Profiler** is an experimental feature that provides visual performance analysis for workflows. It helps users identify performance bottlenecks, understand execution patterns, and optimize their AI workflows.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Developers**: Identify slow nodes and optimize workflow performance
- **Researchers**: Analyze AI pipeline execution characteristics
- **Power Users**: Understand workflow behavior and identify optimization opportunities

## How It Works

### Components

1. **WorkflowProfilerStore** (`web/src/stores/WorkflowProfilerStore.ts`)
   - Manages profiling sessions and historical data
   - Calculates statistics (total duration, avg/max node time, parallelization ratio)
   - Identifies bottlenecks and provides recommendations

2. **WorkflowProfilerPanel** (`web/src/components/profiler/WorkflowProfilerPanel.tsx`)
   - Main dashboard panel for performance analysis
   - Session history with comparison
   - Heatmap toggle and export functionality

3. **PerformanceHeatmap** (`web/src/components/profiler/PerformanceHeatmap.tsx`)
   - Visual overlay showing node execution times as colors
   - Duration mode: Green (<1s) → Yellow (1-5s) → Orange (5-10s) → Red (>10s)
   - Relative mode: Shows relative performance compared to slowest node

4. **BottleneckAnalysis** (`web/src/components/profiler/BottleneckAnalysis.tsx`)
   - Ranked list of slowest nodes
   - Severity indicators (low/medium/high/critical)
   - Actionable recommendations for optimization

### Usage

1. Open a workflow in the editor
2. Click "Run & Profile" to execute the workflow and collect performance data
3. View the profiler panel to see:
   - Total execution time
   - Node-by-node timing breakdown
   - Bottleneck identification
   - Heatmap overlay on the workflow canvas

### API

```typescript
// Store methods
startProfiling(workflowId: string): void
endProfiling(workflowId: string): void
getStatistics(workflowId: string, sessionId: string): ProfilingStatistics
getLatestSession(workflowId: string): ProfilingSession | undefined
setHeatmapVisible(visible: boolean): void
setHeatmapMode(mode: "duration" | "relative"): void
clearSessions(workflowId: string): void
```

## Limitations

- Requires execution to collect timing data
- Session history persists only during the session
- No persistence across page reloads
- Heatmap only shows completed executions

## Future Improvements

- Persist profiling data across sessions
- Compare multiple runs side-by-side
- Export profiling reports
- Integration with model performance metrics
- Auto-suggest optimizations based on patterns

## Feedback

Provide feedback via GitHub issues with the "performance-profiler" tag.
