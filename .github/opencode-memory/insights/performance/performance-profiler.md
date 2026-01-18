# Performance Profiler Implementation

## Overview

Research and prototype implementation of a workflow performance profiling system for NodeTool. The feature analyzes execution timing data to identify bottlenecks and provide optimization suggestions.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Implementation Details

### Components Created

1. **PerformanceProfilerStore** (`web/src/stores/PerformanceProfilerStore.ts`)
   - Zustand store for performance profile data
   - Tracks current and historical profiles
   - Provides bottleneck count and potential savings calculations
   - Stores optimization suggestions

2. **useWorkflowPerformance Hook** (`web/src/hooks/useWorkflowPerformance.ts`)
   - Analyzes workflow execution performance
   - Identifies bottlenecks (>20% of max duration or >100ms)
   - Calculates parallelism score based on node dependencies
   - Generates optimization suggestions
   - Detects parallelizable node types (LLM, ImageGeneration, AudioGeneration, etc.)

3. **PerformanceProfilerPanel** (`web/src/components/performance/PerformanceProfilerPanel.tsx`)
   - Side panel component with performance summary
   - Shows timeline visualization
   - Displays bottlenecks and optimization suggestions
   - Interactive Analyze button

4. **PerformanceTimeline** (`web/src/components/performance/PerformanceTimeline.tsx`)
   - Bar chart visualization of node execution times
   - Color-coded by severity (error/warning/success/info)
   - Shows top 10 slowest nodes
   - Interactive tooltips with detailed info

### Data Sources

The profiler leverages existing execution timing infrastructure:
- **ExecutionTimeStore**: Already tracks start/end times for each node
- **StatusStore**: Provides node execution status
- **ResultsStore**: Provides node results for output size calculation

### Key Features

- **Automatic Bottleneck Detection**: Nodes consuming >20% of max duration or >100ms
- **Parallelism Scoring**: 0-100 score indicating how well the workflow uses parallel execution
- **Optimization Suggestions**:
  - Parallel execution opportunities for independent AI model calls
  - Faster model recommendations for slow nodes
  - Dependency chain analysis
- **Potential Savings Calculation**: Estimated time savings from optimizations

### Design Decisions

1. **Bottleneck Threshold**: 20% of max duration or 100ms minimum - balances sensitivity with relevance
2. **Parallelizable Node Types**: LLM, ImageGeneration, AudioGeneration, VideoGeneration, Embedding, VectorSearch
3. **Historical Profiles Limit**: 20 profiles stored for comparison
4. **Top Nodes Shown**: 10 slowest nodes in timeline for readability

## Usage Example

```typescript
import { PerformanceProfilerPanel } from "./components/performance";

<PerformanceProfilerPanel
  workflowId="workflow-123"
  workflowName="Image Processing Pipeline"
  nodes={workflowNodes}
  onNodeClick={(nodeId) => focusNode(nodeId)}
/>
```

## Limitations

- Requires workflow to be executed at least once to collect timing data
- Cannot detect parallelism opportunities without dependency analysis (future enhancement)
- Suggestions are based on heuristics, not actual execution analysis
- No integration with workflow editor UI yet

## Future Improvements

- Add integration with NodeEditor to highlight bottlenecks on the graph
- Implement dependency analysis for better parallelism detection
- Add comparison with historical runs
- Support export of performance reports
- Add AI-powered optimization recommendations

## Files Created

- `web/src/stores/PerformanceProfilerStore.ts`
- `web/src/hooks/useWorkflowPerformance.ts`
- `web/src/components/performance/PerformanceProfilerPanel.tsx`
- `web/src/components/performance/PerformanceTimeline.tsx`
- `web/src/components/performance/index.ts`
- `web/src/stores/__tests__/PerformanceProfilerStore.test.ts`
- `web/src/components/performance/__tests__/PerformanceProfilerPanel.test.tsx`
