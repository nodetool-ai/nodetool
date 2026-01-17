# Research Report: Workflow Analytics Profiler

## Summary

I researched and implemented a Workflow Analytics Profiler for NodeTool, enabling users to analyze workflow performance and identify bottlenecks. The feature adds a new "Analytics" tab to the bottom panel, displaying execution metrics, bottleneck detection, and a node-by-node breakdown. The implementation leverages existing stores (`ExecutionTimeStore`, `StatusStore`) and integrates cleanly with the panel architecture.

## Implementation

- **Store**: `WorkflowAnalyticsStore.ts` computes analytics from timing data
- **UI**: `WorkflowAnalyticsPanel.tsx` displays metrics, bottlenecks, and node breakdown
- **Integration**: Added "Analytics" tab to `PanelBottom.tsx` alongside Terminal
- **Utils**: Added `formatDuration()` to `formatDateAndTime.ts`

### Key Files Created/Modified:

1. `web/src/stores/WorkflowAnalyticsStore.ts` (NEW)
2. `web/src/components/node_editor/WorkflowAnalyticsPanel.tsx` (NEW)
3. `web/src/components/panels/PanelBottom.tsx` (MODIFIED - added tabs)
4. `web/src/stores/BottomPanelStore.ts` (MODIFIED - added "analytics" view type)
5. `web/src/utils/formatDateAndTime.ts` (MODIFIED - added `formatDuration`)

## Findings

- **Integration**: Leveraging existing stores (ExecutionTimeStore, StatusStore) made implementation straightforward
- **UX**: Tabbed panel approach works well - users can switch between Terminal and Analytics
- **Performance**: Computed on-demand, no performance impact during workflow execution
- **TypeScript**: Required careful handling of `Node` types and store imports

## Evaluation

- **Feasibility**: ⭐⭐⭐⭐⭐ (5/5) - Frontend-only, uses existing data
- **Impact**: ⭐⭐⭐⭐☆ (4/5) - Useful for optimization, but mostly for advanced users
- **Complexity**: ⭐⭐⭐☆☆ (3/5) - Moderate complexity, clean integration

## Recommendation

- [x] **Ready for production** - Clean implementation, follows existing patterns
- [ ] Needs more work (specify what)
- [ ] Interesting but not priority
- [ ] Not viable (explain why)

## Next Steps

1. Add historical analytics tracking across multiple runs
2. Allow customization of bottleneck threshold in settings
3. Add resource usage tracking (CPU, memory) if backend supports it
4. Export analytics as JSON/CSV for external analysis
5. Add visualizations (bar charts, timelines) for better insights
