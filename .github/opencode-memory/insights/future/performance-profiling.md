# Performance Profiling Feature - Research Implementation

## Overview

Implemented a **Workflow Performance Profiling** feature that analyzes workflow execution performance, identifies bottlenecks, and provides optimization recommendations. This feature builds on the existing `ExecutionTimeStore` infrastructure and provides a visual interface for understanding workflow performance.

## Implementation Details

### Files Created

1. **PerformanceStore.ts** (`web/src/stores/PerformanceStore.ts`)
   - Extends execution time tracking with performance snapshot history
   - Calculates metrics: total duration, average/median/p95 node durations
   - Detects bottleneck nodes (nodes taking >2x average duration)
   - Identifies parallelizable nodes (nodes without temporal overlap)
   - Stores up to 50 performance snapshots per workflow

2. **useWorkflowPerformance.ts** (`web/src/hooks/useWorkflowPerformance.ts`)
   - React hook for accessing performance analysis data
   - Provides `WorkflowPerformanceAnalysis` with:
     - Performance score (0-100)
     - Bottleneck and fast node lists
     - Automated optimization recommendations
   - Tracks multiple execution snapshots for comparison

3. **PerformanceProfiler.tsx** (`web/src/components/node/PerformanceProfiler/PerformanceProfiler.tsx`)
   - Visual component for viewing performance metrics
   - Displays:
     - Performance score with color-coded indicator
     - Timing distribution (average, median, p95)
     - Bottleneck nodes with warning indicators
     - Fastest nodes list
     - Optimization recommendations (expandable)
   - Supports re-analysis and history clearing

### Architecture

```
ExecutionTimeStore → PerformanceStore → useWorkflowPerformance → PerformanceProfiler
     (existing)           (new)               (new)                  (new)
```

The feature extends the existing execution time tracking without modifying the original store, following NodeTool's pattern of extending functionality through composition.

## Key Features

### Bottleneck Detection
- Nodes taking >2x average execution time are flagged
- Threshold: configurable, default 2x average
- Minimum duration threshold: 100ms (avoids false positives for quick nodes)

### Performance Score
- Formula: `100 - (bottleneckNodes * 15) - (totalDuration > 60s ? 10 : 0)`
- Score ranges 0-100
- Color-coded: green (≥80), yellow (50-80), red (<50)

### Recommendations Engine
Automated suggestions based on:
1. Bottleneck nodes detected → "Consider optimizing X bottleneck node(s)"
2. High average duration → "Consider caching or parallelizing operations"
3. High variance → "Review resource allocation"
4. Parallelizable nodes → "Consider restructuring dependencies"

## Technical Decisions

### Why Extend ExecutionTimeStore?
- The existing store tracks start/end times but doesn't compute metrics
- Adding computation to the original store would add complexity
- Extension pattern allows experimentation without risk to production code

### Snapshot Storage Strategy
- Stores last 50 snapshots per workflow
- Uses in-memory Zustand store (no backend changes required)
- Snapshots cleared on workflow re-run or manual clear

### Module Resolution Issues
During implementation, encountered TypeScript module resolution errors:
- Fixed by using correct relative paths from subdirectory (`../../../hooks/` instead of `../../hooks/`)
- All new files follow existing project patterns for imports

## Usage Example

```typescript
const { analysis, recordExecution } = useWorkflowPerformance(workflowId);

// After workflow execution completes:
recordExecution(nodeCount);

// Display performance data:
console.log(analysis.performanceScore); // 0-100
console.log(analysis.bottleneckNodes);  // Array of slow nodes
console.log(analysis.recommendations);  // Optimization suggestions
```

## Limitations

1. **Frontend-only**: No backend execution time data (worker-side timing not captured)
2. **Single workflow**: Performance comparisons across different workflows require manual export
3. **No historical trends**: Snapshot history exists but no visualization of trends over time
4. **Estimated durations**: Uses client-side timestamps, may vary from server-side measurements

## Future Improvements

1. **Backend integration**: Capture worker-side execution times for more accurate metrics
2. **Historical trends**: Graph showing performance over multiple runs
3. **Comparison mode**: Compare performance across workflow versions
4. **Export metrics**: Export performance data for external analysis
5. **Custom thresholds**: Allow users to configure bottleneck detection sensitivity

## Files Modified/Created

- Created: `web/src/stores/PerformanceStore.ts`
- Created: `web/src/hooks/useWorkflowPerformance.ts`
- Created: `web/src/components/node/PerformanceProfiler/PerformanceProfiler.tsx`
- Created: `web/src/components/node/PerformanceProfiler/index.ts`

## Verification

- TypeScript type checking: ✅ Passes
- ESLint: ✅ Passes (no warnings for new files)
- Jest tests: ✅ All 3089 tests pass
