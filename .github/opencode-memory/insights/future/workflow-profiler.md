# Workflow Profiler Implementation

## Overview

Implemented a Workflow Performance Profiler - an experimental feature that analyzes workflows and provides:
- Estimated execution time based on node types
- Parallelization opportunity detection
- Bottleneck identification
- Execution layer visualization

## Technical Approach

### Store Design
- Created `WorkflowProfilerStore.ts` with `analyzeWorkflow()` function
- Uses Kahn's algorithm (topological sort) for execution layer analysis
- Estimates node execution times based on predefined time constants by node type

### Time Estimation
```typescript
const NODE_TIME_ESTIMATES: Record<string, number> = {
  "nodetool.llm.LLM": 2000,
  "nodetool.llm.Chat": 2000,
  "nodetool.audio.SpeechToText": 1000,
  // ... more node types
};
```

### Parallelization Analysis
- Calculates theoretical speedup: sequentialTime / parallelTime
- Identifies parallelizable nodes (processing nodes at non-root levels)
- Groups nodes by execution layer for visualization

### UI Integration
- Added profiler toggle to ViewportStatusIndicator (speed icon)
- Keyboard shortcut: Ctrl+P / Meta+P
- Floating panel with stats, parallelization info, and layer breakdown

## Key Files
- `web/src/stores/WorkflowProfilerStore.ts` - Core profiling logic
- `web/src/components/node_editor/WorkflowProfiler.tsx` - UI component
- `web/src/components/node_editor/ViewportStatusIndicator.tsx` - Added profiler button
- `web/src/components/node_editor/NodeEditor.tsx` - Integration
- `web/src/config/shortcuts.ts` - Added profileWorkflow shortcut

## Patterns Followed
- Zustand store with selectors for state management
- React.memo for component optimization
- MUI theming and styling patterns
- Selective store subscriptions to prevent unnecessary re-renders

## Limitations
- Time estimates are based on heuristics, not actual execution data
- Does not account for model loading times
- Assumes all nodes execute sequentially within a layer
- No backend integration for real execution metrics

## Future Improvements
- Store actual execution times from completed runs
- Integrate with ResultsStore for real data
- Add comparison between estimated vs actual times
- Export profiling reports
