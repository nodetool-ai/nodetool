# Workflow Analytics Profiler (Experimental)

## Overview

The Workflow Analytics Profiler is an experimental feature that helps you analyze the performance of your AI workflows. It provides detailed metrics about node execution times, identifies performance bottlenecks, and helps you optimize your workflows for better performance.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Performance Optimization**: Identify which nodes take the most time to execute
- **Bottleneck Detection**: Automatically detect nodes that consume a significant portion of total execution time
- **Workflow Comparison**: Compare execution times across different workflow runs
- **Debugging**: Understand why a workflow might be running slowly

## How It Works

The profiler collects timing data from the existing `ExecutionTimeStore` and `StatusStore` to compute analytics:

1. **Timing Collection**: Each node's execution start and end times are recorded
2. **Analytics Computation**: Total duration, average duration, and percentage share are calculated
3. **Bottleneck Detection**: Nodes taking >50% of total execution time are flagged as bottlenecks
4. **Visualization**: Results are displayed in a tabbed panel with metrics, bottlenecks, and node breakdown

## Usage

1. Run a workflow to completion
2. Open the bottom panel (Ctrl+`)
3. Click the "Analytics" tab
4. Review:
   - **Summary Cards**: Total nodes, execution time, slowest node, bottleneck count
   - **Bottlenecks**: List of nodes consuming significant time
   - **Node Breakdown**: Table of all executed nodes sorted by duration

## Technical Details

### Store

`web/src/stores/WorkflowAnalyticsStore.ts` provides:
- `getAnalytics(workflowId, nodes)`: Computes analytics from timing data
- Returns `WorkflowAnalytics` with summary stats, bottlenecks, and node details

### UI Components

- `WorkflowAnalyticsPanel.tsx`: Main analytics display component
- Integrated into `PanelBottom.tsx` as a tab alongside Terminal
- Uses existing `BottomPanelStore` for panel state management

### Data Sources

- `ExecutionTimeStore`: Tracks node execution start/end times
- `StatusStore`: Tracks node execution status (running, completed, failed)
- `NodeStore`: Provides current workflow nodes

## Limitations

- Only shows data after workflow execution completes
- Does not persist analytics across page refreshes
- Bottleneck threshold is fixed at 50% (may not suit all workflows)
- Does not track memory usage or other resource metrics

## Future Improvements

- Add historical analytics across multiple runs
- Allow customization of bottleneck threshold
- Add resource usage tracking (CPU, memory)
- Export analytics as JSON/CSV
- Compare analytics between workflow versions

## Feedback

Provide feedback via GitHub issues or through the OpenCode system.
