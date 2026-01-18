# Workflow Performance Profiler Implementation

**Date**: 2026-01-18

## Overview

Implemented a Workflow Performance Profiler feature that analyzes workflow execution performance, identifies bottlenecks, and provides visual feedback to users.

## Architecture

### Components Created

1. **PerformanceStore** (`web/src/stores/PerformanceStore.ts`)
   - Zustand store for managing performance profiles
   - Tracks execution history per node across multiple runs
   - Calculates bottlenecks based on configurable thresholds
   - Stores node performance data including duration, status, and average execution time

2. **PerformanceProfilerPanel** (`web/src/components/node_editor/PerformanceProfilerPanel.tsx`)
   - Floating panel component (toggled via Ctrl+P / Cmd+P)
   - Displays total duration, bottleneck count, and node-by-node breakdown
   - Visual progress bars showing relative execution time
   - Color-coded performance indicators (green/yellow/red)
   - Focus button to navigate to specific nodes

3. **PerformancePanelStore** (`web/src/stores/PerformancePanelStore.ts`)
   - Simple store for managing panel visibility

4. **Tests** (`web/src/stores/__tests__/PerformanceStore.test.ts`)
   - 8 tests covering all major functionality

## Key Features

### Bottleneck Detection
- Configurable thresholds: "slow" (2s) and "very slow" (5s)
- Automatically identifies nodes taking >30% of max execution time
- Sorts bottlenecks by duration for quick identification

### Execution History
- Tracks multiple executions per node
- Calculates average duration across runs
- Persists history during session

### Visual Feedback
- Progress bars show relative execution time
- Color coding: green (<2s), yellow (2-5s), red (>5s)
- "Bottleneck" badges for problematic nodes

## Integration

- Added to `NodeEditor.tsx` with keyboard shortcut (Ctrl+P / Cmd+P)
- Uses existing `ExecutionTimeStore` for duration data
- Uses existing `ResultsStore` for status information

## Performance Considerations

- Uses `React.memo` to prevent unnecessary re-renders
- Selective Zustand subscriptions via selectors
- `useMemo` for expensive calculations

## Files Modified/Created

- `web/src/stores/PerformanceStore.ts` (NEW)
- `web/src/stores/PerformancePanelStore.ts` (NEW)
- `web/src/components/node_editor/PerformanceProfilerPanel.tsx` (NEW)
- `web/src/components/node_editor/NodeEditor.tsx` (MODIFIED - added panel and keyboard shortcut)
- `web/src/stores/__tests__/PerformanceStore.test.ts` (NEW)

## Usage

1. Run a workflow
2. Press `Ctrl+P` (or `Cmd+P` on Mac) to open the Performance Profiler
3. View total execution time, bottleneck count, and node breakdown
4. Click focus button to navigate to specific nodes
5. Re-run workflow to see updated metrics

## Future Enhancements

- Cost estimation based on model usage
- Comparison with previous runs
- Export performance data
- Historical trends visualization
- Customizable thresholds via settings
