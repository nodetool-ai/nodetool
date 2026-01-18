# Performance Profiler Implementation

**Insight**: Building performance analysis tools using existing execution timing data.

**Approach**:
- Created `useWorkflowPerformance` hook that analyzes timing data from `ExecutionTimeStore`
- Built `PerformanceProfiler` component with visual metrics, bottleneck detection, and suggestions
- Used existing stores to minimize new state management

**Technical Details**:
```typescript
// Hook returns performance metrics from timing data
const metrics = useWorkflowPerformance(workflowId, nodes);
// { performanceScore, bottlenecks, totalDuration, ... }

// Component shows visual analysis
<PerformanceProfiler workflowId={id} nodes={nodes} />
```

**Key Components**:
- `PerformanceSummary`: Grade-based performance score with total/average duration
- `PerformanceChart`: Horizontal bar chart of execution times
- `BottleneckList`: Nodes taking >1s, highlighted in error color
- `OptimizationSuggestions`: Automated recommendations based on patterns

**Performance Score Calculation**:
- Starts at 100
- -20 for workflows >30s, -10 for >10s
- -30 * bottleneckRatio
- -20 * (1 - executionRate)

**Impact**: Users can now identify slow nodes and optimize workflows visually.

**Date**: 2026-01-18

**Files**:
- `web/src/hooks/useWorkflowPerformance.ts`
- `web/src/components/performance/PerformanceProfiler.tsx`
- `web/src/components/performance/index.ts`
- `docs/research/WORKFLOW_PERFORMANCE_PROFILER.md`
