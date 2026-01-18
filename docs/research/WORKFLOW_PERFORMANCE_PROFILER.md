# Workflow Performance Profiler (Experimental)

## Overview
Visual performance analysis tool that identifies workflow bottlenecks by analyzing node execution times, providing actionable insights for optimization.

## Status
⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases
- **Researchers**: Identify performance patterns in AI workflows
- **Developers**: Debug slow workflows and optimize node configurations
- **Users**: Understand which nodes take longest to execute

## How It Works
The profiler collects execution time data from `ExecutionTimeStore` and visualizes:
1. Node execution timeline
2. Bottleneck identification (nodes > 1s execution)
3. Performance score and recommendations
4. Comparison with similar workflows

## Usage Example
```typescript
import { WorkflowProfiler } from '../components/performance/WorkflowProfiler';

<WorkflowProfiler workflowId="current" />
```

## Architecture
```
WorkflowProfiler
├── PerformanceSummary    # Overall metrics (total time, score)
├── ExecutionTimeline     # Visual timeline of node execution
├── BottleneckList        # Identified slow nodes
├── PerformanceChart      # Bar chart of execution times
└── Recommendations       # Optimization suggestions
```

## Implementation Details
- Uses `ExecutionTimeStore` for timing data
- Memoized calculations for performance
- MUI Charts for visualization
- Integration with NodeStore for workflow structure

## Limitations
- Requires executed workflow data
- No historical comparison yet
- Basic bottleneck detection only
- No automatic optimization suggestions

## Feedback
Provide feedback via GitHub issues labeled "performance-profiler".
