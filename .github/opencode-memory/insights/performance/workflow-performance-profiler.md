# Workflow Performance Profiler Implementation

## Overview

Implemented an experimental workflow performance profiling feature to track execution metrics, identify bottlenecks, and provide performance insights across multiple workflow runs.

## Key Components

### 1. WorkflowProfilerStore (`web/src/stores/WorkflowProfilerStore.ts`)

Central store for tracking workflow execution performance:

- **NodeExecutionMetric**: Tracks individual node execution time, status, and data sizes
- **WorkflowRunProfile**: Complete profile of a single workflow run including all node metrics
- **BottleneckAnalysis**: Identifies nodes with longest execution time
- **ParallelizationAnalysis**: Calculates theoretical minimum vs actual duration
- **PerformanceInsight**: Automated suggestions for optimization

### 2. useWorkflowProfiler Hook (`web/src/hooks/useWorkflowProfiler.ts`)

React hook providing clean interface to the profiler store:

```typescript
const {
  startRecording,
  endRecording,
  recordNodeExecution,
  getLatestProfile,
  getProfiles,
  getBottlenecks,
  getParallelizationAnalysis,
  getPerformanceInsights,
  isRecording,
  clearProfiles
} = useWorkflowProfiler(workflowId);
```

### 3. WorkflowProfilerPanel UI (`web/src/components/node_editor/WorkflowProfilerPanel.tsx`)

Visual interface showing:

- **Execution Summary**: Total duration, node count, status
- **Node Execution Times**: Bar chart visualization of per-node durations
- **Bottlenecks**: Top 3 slowest nodes with percentage breakdown
- **Parallelization Analysis**: Efficiency percentage with theoretical minimum
- **Performance Insights**: Automated suggestions (regressions, optimizations)

### 4. Integration (`web/src/stores/workflowUpdates.ts`)

Integrated with existing workflow execution pipeline:

- Records node execution timing automatically
- Tracks job start/completion for run profiles
- Maintains backward compatibility with existing ExecutionTimeStore

## Technical Implementation

### Performance Tracking

1. **Job Start**: `profilerStartRecording(workflowId)` called when job starts
2. **Node Execution**: `profilerRecordNodeExecution()` called when node completes
3. **Job End**: `profilerEndRecording(workflowId, status)` called when job ends

### Analysis Algorithms

**Bottleneck Detection**:
```typescript
const sortedMetrics = [...nodeMetrics].sort((a, b) => b.duration - a.duration);
return sortedMetrics.slice(0, limit).map(metric => ({
  percentageOfTotal: (metric.duration / totalDuration) * 100
}));
```

**Parallelization Efficiency**:
```typescript
theoreticalMinimum = calculateMinDuration(entryNodes);
efficiency = (theoreticalMinimum / totalDuration) * 100;
```

**Performance Regression Detection**:
```typescript
const durationChange = ((currentRun - previousRun) / previousRun) * 100;
if (durationChange > 20) {
  insights.push({ type: "regression", severity: "high" });
}
```

## Usage

The profiler is automatically enabled when executing workflows. Access the panel through the editor UI.

### API Examples

```typescript
// Get latest profile
const profile = getLatestProfile();

// Get bottlenecks
const bottlenecks = getBottlenecks(3);

// Analyze parallelization
const analysis = getParallelizationAnalysis(graph);

// Get insights
const insights = getPerformanceInsights(graph);
```

## Limitations

1. **Session-based**: Profiles are stored in memory (Zustand store), cleared on page refresh
2. **Limited history**: Currently stores all runs, could benefit from pruning old runs
3. **Simple heuristics**: Parallelization analysis uses basic topological sort
4. **No historical comparison**: Compare against specific baseline not implemented

## Future Improvements

- Persist profiles to localStorage for long-term tracking
- Add comparison against baseline runs
- Export profiling data for external analysis
- Integration with cost estimation (runtime * model cost)
- Threshold-based alerting for regressions
