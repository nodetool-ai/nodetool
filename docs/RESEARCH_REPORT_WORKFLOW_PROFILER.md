# Research Report: Workflow Performance Profiler

## Summary

Implemented an experimental Workflow Performance Profiler that analyzes and visualizes workflow execution performance. The feature builds on the existing `ExecutionTimeStore` infrastructure to identify bottlenecks and provide aggregate statistics. The profiler provides total/avg/max duration metrics, automatic bottleneck identification (top 5 slowest nodes), and a visual timeline with duration bars. It follows NodeTool's visual-first design principles with MUI components.

## Implementation

**What was built:**
- `WorkflowProfilerStore.ts` - Zustand store that aggregates timing data from ExecutionTimeStore
- `WorkflowProfiler.tsx` - Main visualization component with statistics, bottleneck table, and timeline
- `PerformancePanel.tsx` - Dockview panel wrapper for integration with the Node Editor
- `index.ts` - Public exports for easy importing

**Technical approach:**
- Leveraged existing `ExecutionTimeStore` timing collection to avoid duplication
- Created separate profiler store for clean separation of concerns
- Used selective Zustand subscriptions to prevent unnecessary re-renders
- Followed existing MUI styling and component patterns
- Integrated with dockview panel system for consistent UI

**Key challenges:**
- TypeScript strict mode required careful null checking and type narrowing
- Understanding existing store patterns (e.g., `useNodes` from NodeContext vs direct store access)
- Dockview panel props interface had optional vs required properties

## Findings

**What works well:**
- Building on existing ExecutionTimeStore ensures consistency and reduces code duplication
- The aggregate statistics provide immediate value for identifying slow workflows
- Visual bottleneck table with duration bars is intuitive and actionable
- Dockview panel integration allows flexible placement in the editor UI

**What doesn't work:**
- Single execution snapshot - no historical comparison
- Manual re-analysis required for updated data
- No integration with server-side timing metrics
- Limited to client-side timing (doesn't capture backend processing time)

**Unexpected discoveries:**
- The existing NodeData type uses `title` and `originalType` instead of `label` and `nodeType`
- `useNodes` hook from NodeContext is the preferred way to access node state
- Dockview's IDockviewPanelProps has optional `title` and `onClose` that need nullish coalescing

## Evaluation

- **Feasibility**: ⭐⭐⭐⭐☆ (4/5) - Frontend-only, builds on existing infrastructure
- **Impact**: ⭐⭐⭐☆☆ (3/5) - Useful for researchers/developers, niche audience
- **Complexity**: ⭐⭐⭐☆☆ (3/5) - Moderate complexity, ~300 lines of code
- **Maintainability**: ⭐⭐⭐⭐☆ (4/5) - Clean patterns, follows codebase conventions

## Recommendation

- [x] **Ready for experimental use** - Feature is functional and follows quality standards
- [ ] Needs more work (specify what) - Historical comparison, auto-refresh, server integration
- [ ] Interesting but not priority - Nice to have but not essential
- [ ] Not viable (explain why)

## Next Steps

1. **Historical Comparison**: Store multiple profiles for version-to-version comparison
2. **Auto-Analysis**: Automatically trigger analysis on workflow completion
3. **Server Integration**: Correlate with backend timing for complete picture
4. **Export Functionality**: Allow exporting profiling data for external analysis
5. **Alerting**: Configurable thresholds for bottleneck alerts

## Files Created

- `docs/RESEARCH_WORKFLOW_PROFILER.md` - Feature documentation
- `web/src/stores/WorkflowProfilerStore.ts` - Profiler store (113 lines)
- `web/src/components/profiler/WorkflowProfiler.tsx` - Visualization (320 lines)
- `web/src/components/profiler/PerformancePanel.tsx` - Panel wrapper (66 lines)
- `web/src/components/profiler/index.ts` - Exports (4 lines)
- `.github/opencode-memory/insights/future/workflow-profiler-implementation.md` - Technical insights
