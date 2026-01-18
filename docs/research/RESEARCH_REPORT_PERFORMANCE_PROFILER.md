# Research Report: Workflow Performance Profiler

## Summary

Explored and implemented a **Workflow Performance Profiler** feature for NodeTool that analyzes workflow execution performance, identifies bottlenecks, and visualizes node-level timing data. The feature integrates with the existing execution timing infrastructure to provide insights into which nodes consume the most runtime.

## Implementation

**What was built:**
- `PerformanceAnalysisStore.ts` - Zustand store for managing workflow performance profiles
- `PerformancePanel.tsx` - UI panel displaying performance analysis with table visualization
- Integration into the right panel system (PanelRight.tsx) with Speed icon toolbar button
- Integration with existing stores: ExecutionTimeStore, StatusStore, NodeFocusStore

**Technical approach:**
- Leveraged existing `ExecutionTimeStore` for node timing data (already tracking start/end times)
- Used `StatusStore` for node completion status
- Created a performance profile with: total duration, node counts, individual node metrics, bottleneck detection
- Bottleneck detection identifies top 3 slowest nodes by duration
- Click-to-focus navigation to locate nodes in the editor

**Key challenges:**
- Understanding NodeStore API and accessing node data correctly
- Integrating with the existing panel system and toolbar
- Proper TypeScript typing with ReactFlow Node types

## Findings

**What works well:**
- Integration with existing timing infrastructure is seamless
- The panel-based architecture makes it easy to add new views
- Click-to-focus navigation provides good UX for locating slow nodes
- Visual indicators (warning icons, progress bars, color coding) help identify bottlenecks

**What doesn't work:**
- Performance analysis only available after workflow execution completes
- No historical comparison between runs
- Profile data not persisted between sessions

**Unexpected discoveries:**
- NodeData doesn't contain `label` or `nodeType` directly - need to access through ReactFlow Node properties
- NodeStoreState doesn't have `focusNode` method - need to use separate NodeFocusStore
- The right panel already had a flexible architecture for adding new views

## Evaluation

| Criteria | Rating | Notes |
|----------|--------|-------|
| Feasibility | ⭐⭐⭐⭐⭐ | Built entirely with frontend changes, leverages existing infrastructure |
| Impact | ⭐⭐⭐⭐ | Valuable for developers and advanced users optimizing workflows |
| Complexity | ⭐⭐⭐ | Moderate - requires understanding multiple stores and panel system |
| Alignment | ⭐⭐⭐⭐⭐ | Fits NodeTool's visual-first, no-code philosophy |

## Recommendation

- [x] **Ready for experimental use** - Feature works as designed
- [ ] Needs more work (specify what) - Would benefit from historical comparison and persistence
- [ ] Interesting but not priority
- [ ] Not viable

The feature is functional and provides value. It's marked as experimental in documentation since the API may evolve based on user feedback.

## Next Steps

If this feature should be pursued further:

1. **Persistence**: Save performance profiles to localStorage for comparison across sessions
2. **Historical Comparison**: Compare current run with previous runs to detect regressions
3. **Optimization Suggestions**: Recommend specific actions based on bottleneck analysis
4. **Export**: Allow exporting performance reports
5. **Integration with Versioning**: Compare performance across workflow versions

## Files Created/Modified

- Created: `web/src/stores/PerformanceAnalysisStore.ts`
- Created: `web/src/components/panels/PerformancePanel.tsx`
- Created: `docs/research/performance-profiler.md`
- Modified: `web/src/components/panels/PanelRight.tsx`
- Modified: `web/src/stores/RightPanelStore.ts`
- Modified: `.github/opencode-memory/features.md`
- Modified: `.github/opencode-memory/project-context.md`
