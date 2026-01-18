# Performance Profiler Research Feature

## Overview

Implemented a **Workflow Performance Profiler** as a research feature to help researchers and developers track, analyze, and optimize workflow execution performance.

## Implementation Details

### Components Created

1. **PerformanceProfilerStore** (`web/src/stores/PerformanceProfilerStore.ts`)
   - Tracks workflow execution metrics across runs
   - Records node-level performance data (execution time, memory usage, status)
   - Generates performance snapshots for historical analysis
   - Provides bottleneck identification and ranking

2. **PerformanceProfiler Panel** (`web/src/components/performance/PerformanceProfiler.tsx`)
   - Visual dashboard showing performance metrics
   - Execution timeline and breakdown views
   - Bottleneck identification with color-coded bars
   - Historical performance trends
   - Success rate and duration statistics

3. **Tests** (`web/src/stores/__tests__/PerformanceProfilerStore.test.ts`)
   - 12 test cases covering all store functionality

### Key Features

- **Real-time Recording**: Capture performance metrics during workflow execution
- **Node-level Breakdown**: Track individual node execution times
- **Bottleneck Detection**: Automatically identify slowest nodes
- **Historical Analysis**: Store and compare performance across multiple runs
- **Visual Dashboard**: Rich UI with charts and metrics
- **Integration Ready**: Designed to work with existing version history

### Data Model

```typescript
interface PerformanceSnapshot {
  id: string;
  workflowId: string;
  workflowName: string;
  version: number;
  timestamp: number;
  durationMs: number;
  nodeCount: number;
  status: "success" | "partial" | "failed";
  topBottlenecks: Array<{
    nodeId: string;
    nodeType: string;
    durationMs: number;
  }>;
}
```

## Technical Decisions

### Store Pattern
- Used Zustand for state management (consistent with codebase)
- Separate store from UI components for testability
- Store handles all recording logic, UI is purely presentational

### Performance Considerations
- Memoized calculations for metrics aggregation
- Selective subscriptions to prevent unnecessary re-renders
- Limited snapshot history (configurable limit)

### Integration Points
- Works with existing `ExecutionTimeStore` for timing data
- Complements `VersionHistoryPanel` for version-based analysis
- Designed to work alongside `StatusStore` for node status

## Usage

```typescript
import { PerformanceProfiler } from "../components/performance";

// In a component:
<PerformanceProfiler
  workflowId="workflow-123"
  onAnalyzeBottleneck={(nodeId) => /* highlight node */}
/>
```

## Limitations (Current MVP)

- In-memory storage (snapshots lost on refresh)
- No persistence to backend
- Limited to current workflow (no cross-workflow comparison)
- No automated regression detection
- Memory usage estimation is optional/unreliable

## Future Enhancements

1. **Persistence**: Save snapshots to backend for long-term analysis
2. **Comparison View**: Side-by-side performance comparison of versions
3. **Regression Detection**: Alert when performance degrades
4. **Resource Tracking**: Detailed memory/CPU usage per node
5. **Export**: Export performance data for external analysis
6. **Recommendations**: AI-powered optimization suggestions

## Files Modified/Created

- Created: `web/src/stores/PerformanceProfilerStore.ts`
- Created: `web/src/components/performance/PerformanceProfiler.tsx`
- Created: `web/src/components/performance/index.ts`
- Created: `web/src/stores/__tests__/PerformanceProfilerStore.test.ts`

## Verification

- TypeScript: ✅ Passes
- ESLint: ✅ Passes (warnings only)
- Tests: ✅ 12/12 passing
