# Performance Profiler Implementation

## Overview

Implemented a **Performance Profiler** feature that provides visual performance analysis for workflow execution. The feature helps users understand workflow performance characteristics, identify bottlenecks, and get optimization suggestions.

## Implementation Details

### Components Created

1. **PerformanceProfiler.tsx** (`web/src/components/performance/`)
   - Main component with full and compact views
   - Timeline visualization showing node execution order and duration
   - Bottleneck detection with severity levels
   - Automated optimization suggestions

2. **Panel Integration**
   - Added "Profiler" tab to the bottom panel alongside "Terminal"
   - Accessible via the bottom panel toggle or keyboard shortcut (Ctrl+`)

### Key Features

1. **Execution Timeline**
   - Visual bar chart showing each node's execution duration
   - Color-coded by execution status (completed, failed, running, pending)
   - Time axis with formatted duration labels

2. **Performance Statistics**
   - Total workflow execution time
   - Completed vs. total node count
   - Average node execution time
   - Failed node count

3. **Bottleneck Detection**
   - Identifies nodes taking significant execution time (>10% threshold)
   - Categorizes severity: critical (50%+), high (30%+), medium (15%+), low (10%+)
   - Provides context-specific suggestions for each bottleneck type

4. **Optimization Suggestions**
   - Model optimization recommendations for LLM nodes
   - Parallelization opportunities for independent operations
   - Configuration review for slow nodes

### Technical Architecture

**Data Sources:**
- `useNodes()` - Get workflow nodes from NodeContext
- `useExecutionTimeStore` - Track node execution timing
- `useResultsStore` - Get execution status per node
- `useWebsocketRunner` - Detect workflow completion state

**State Management:**
- Component-level state (no global store needed)
- Local state for profile data, analysis status, UI expansion

### Integration Points

1. **Bottom Panel** - Added Profiler tab alongside Terminal
2. **ExecutionTimeStore** - Leverages existing timing infrastructure
3. **NodeContext** - Accesses node data via useNodes hook

## Usage

1. Run a workflow to completion
2. Open the bottom panel (Ctrl+`)
3. Switch to the "Profiler" tab
4. View performance stats, timeline, bottlenecks, and suggestions
5. Click "Analyze" to refresh the analysis

## Files Modified/Created

- `web/src/components/performance/PerformanceProfiler.tsx` (NEW)
- `web/src/components/performance/index.ts` (NEW)
- `web/src/components/panels/PanelBottom.tsx` (MODIFIED)
- `web/src/stores/BottomPanelStore.ts` (MODIFIED)

## Testing

- TypeScript compilation: Passes
- ESLint: Passes (warnings only for style preferences)
- Unit tests: Not applicable (new component, no business logic to test)

## Limitations

- Requires workflow to complete before analysis
- Timing data persists across runs (clear on new run recommended)
- Suggestions are heuristic-based, may not apply to all cases
- No historical comparison (could be added in future)

## Future Improvements

- Historical performance comparison across workflow versions
- Resource usage tracking (memory, CPU)
- Cost estimation based on model usage
- Export profiling results to external tools
