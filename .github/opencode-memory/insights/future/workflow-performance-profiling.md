# Workflow Performance Profiling

**Feature**: Workflow Analytics Dashboard

**Status**: Experimental - Prototype complete

**Date**: 2026-01-17

## Overview

Implemented a workflow performance profiling system that provides runtime statistics and execution metrics for AI workflows. The feature includes:

- Real-time execution timing tracking per node
- Aggregate statistics (total runtime, average node time, completion percentage)
- Performance highlights (slowest/fastest nodes)
- Detailed execution time breakdown by node

## Implementation

### Core Components

1. **useWorkflowAnalytics Hook** (`web/src/hooks/useWorkflowAnalytics.ts`)
   - Aggregates data from NodeStore, ExecutionTimeStore, and StatusStore
   - Calculates metrics: node count, edge count, executed nodes, total/average duration
   - Identifies slowest and fastest nodes
   - Sorts nodes by execution time
   - Detects errors in workflow execution

2. **WorkflowStatsPanel Component** (`web/src/components/node_editor/WorkflowStatsPanel.tsx`)
   - Displays workflow performance metrics in a panel
   - Visual progress bar for completion status
   - Key metrics cards (Nodes, Connections, Total Runtime, Avg Node Time)
   - Performance highlights with emoji indicators
   - Table of execution times by node (sorted by duration)
   - Memoized for performance

### Integration

- Added to `NodeEditor.tsx` next to SelectionActionToolbar
- Uses existing `ExecutionTimeStore` which was already tracking node execution times
- Leverages `StatusStore` for error detection
- No backend changes required

## Key Learnings

- **Zustand Stores as Data Source**: The existing `ExecutionTimeStore` already had the infrastructure for tracking execution times. This feature simply aggregates and presents that data.
- **Performance Considerations**: Used `useMemo` for analytics calculations to avoid recalculating on every render. Used `React.memo` for the panel component.
- **Theme Integration**: Used MUI theme variables (`theme.vars.palette`) for consistent styling with the existing dark mode.

## Files Changed

- `web/src/hooks/useWorkflowAnalytics.ts` (NEW)
- `web/src/components/node_editor/WorkflowStatsPanel.tsx` (NEW)
- `web/src/components/node_editor/NodeEditor.tsx` (MODIFIED - imports and render)
- `web/src/hooks/__tests__/useWorkflowAnalytics.test.ts` (NEW)

## Limitations

- Data is session-based (cleared when page refreshes)
- No historical data tracking across workflow runs
- No cost estimation (would require backend model pricing data)
- No parallelization analysis

## Future Improvements

- Persist analytics data for historical tracking
- Add comparison with previous runs
- Include cost estimation based on model usage
- Detect parallelization opportunities
- Add visualization (charts, graphs)
- Export metrics for external analysis
