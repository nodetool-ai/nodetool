# Workflow Performance Profiler (Experimental)

## Overview

The **Workflow Performance Profiler** is an experimental feature that analyzes workflow execution performance and identifies performance bottlenecks. It provides insights into:

- Total workflow execution time
- Individual node execution durations
- Percentage of total runtime per node
- Automatic detection of bottleneck nodes (top 3 slowest)
- Click-to-focus navigation to bottleneck nodes

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Developers**: Identify slow nodes that impact workflow performance
- **Researchers**: Analyze execution patterns and optimize workflows
- **Users**: Understand which parts of their workflows take the most time

## How It Works

The profiler integrates with the existing execution timing infrastructure:

1. **Data Collection**: Uses `ExecutionTimeStore` to track node start/end times during workflow execution
2. **Status Integration**: Uses `StatusStore` to get node completion status
3. **Analysis**: Calculates duration, percentage of total, and identifies bottlenecks
4. **Visualization**: Displays results in a collapsible panel with table visualization

## Usage

1. Run a workflow to completion
2. Open the right panel (press `P` or click the Speed icon in the toolbar)
3. Click "Analyze Performance" to generate the profile
4. View total runtime, completed nodes, and bottlenecks
5. Expand "Node Performance" to see detailed timing for each node
6. Click any row to focus that node in the editor

## Technical Details

### Files Created

- `web/src/stores/PerformanceAnalysisStore.ts` - Store for performance profiles
- `web/src/components/panels/PerformancePanel.tsx` - UI panel component
- `web/src/components/panels/PanelRight.tsx` - Integration with right panel

### Key Components

- `PerformanceAnalysisStore` - Manages workflow performance profiles
- `PerformancePanel` - Displays performance analysis results
- Right panel integration with Speed icon toolbar button

### Integration Points

- Uses existing `ExecutionTimeStore` for timing data
- Uses existing `StatusStore` for node status
- Uses existing `NodeFocusStore` for node navigation
- Integrated into the right panel alongside Inspector, Assistant, Logs, etc.

## Limitations

- Only analyzes completed workflows (timing data only available after execution)
- Requires node execution to complete to capture full timing
- Does not persist profiles between sessions
- Bottleneck detection limited to top 3 nodes

## Future Improvements

- Historical performance comparison
- Automated optimization suggestions
- Performance regression detection
- Export performance reports
- Integration with workflow versioning

## Feedback

To provide feedback on this feature, please open an issue at:
https://github.com/nodetool-ai/nodetool/issues
