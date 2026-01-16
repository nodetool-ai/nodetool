# Workflow Performance Profiler Implementation

**Insight**: Built a workflow performance profiler that analyzes execution data and graph structure to identify bottlenecks.

**Rationale**: Researchers and developers need tools to understand and optimize workflow performance. The profiler provides actionable insights without requiring backend changes.

**Implementation**:

```typescript
// Key metrics calculation
const totalDuration = nodeTimings.reduce((sum, n) => sum + (n.duration || 0), 0);
const efficiency = (estimatedParallelTime / totalDuration) * 100;
const bottlenecks = nodeTimings.filter(n => n.duration >= totalDuration * 0.1);
```

**Key Features**:
- Total duration and parallel time estimation
- Efficiency metric (parallel vs sequential execution)
- Bottleneck detection (>10% of total time)
- Graph depth and parallel path analysis
- AI-powered optimization suggestions

**Integration Points**:
- Uses existing `ExecutionTimeStore` for timing data
- Uses `topologicalSort` from `core/graph.ts` for graph analysis
- UI component follows existing patterns (collapsible panel, MUI styling)

**Files**:
- `web/src/stores/WorkflowProfilerStore.ts`
- `web/src/components/node_editor/WorkflowProfiler.tsx`

**Date**: 2026-01-17
