# Research Report: Workflow Performance Profiler

## Summary

Implemented a Workflow Performance Profiler as an experimental feature for NodeTool. This tool analyzes workflow graphs to estimate execution times, identify parallelization opportunities, and detect potential bottlenecks. The profiler provides valuable insights for researchers and developers working with complex AI workflows.

## Implementation

**What was built:**
- `WorkflowProfilerStore.ts` - Core profiling logic with time estimation, topological sorting, and parallelization analysis
- `WorkflowProfiler.tsx` - UI component with stats cards, parallelization visualization, and execution layer breakdown
- Integration with NodeEditor via keyboard shortcut (Ctrl+P / Meta+P) and toolbar button
- Added to ViewportStatusIndicator component with a speed icon

**Technical approach:**
- Uses Kahn's algorithm for topological sort to determine execution layers
- Predefined time estimates for 40+ node types based on computational complexity
- Calculates theoretical speedup from parallelization opportunities
- Groups nodes by execution level for visualization

**Key challenges:**
- TypeScript type compatibility with ReactFlow's Node types
- Properly casting useReactFlow hooks to access node data
- Following existing MUI theming and component patterns

## Findings

**What works well:**
- Time estimation provides reasonable relative comparisons between workflows
- Execution layer visualization helps users understand data flow
- Keyboard shortcut integration follows existing patterns
- The floating panel design matches NodeInfoPanel style

**What doesn't work:**
- Time estimates are heuristics, not actual measurements
- Doesn't account for model loading times or I/O wait
- No backend integration for real execution metrics

**Unexpected discoveries:**
- Node type handling needed careful null checking
- The topological sort implementation in `core/graph.ts` was reusable

## Evaluation

| Criteria | Rating |
|----------|--------|
| Feasibility | ⭐⭐⭐⭐⭐ (5/5) - Frontend-only, no backend needed |
| Impact | ⭐⭐⭐⭐☆ (4/5) - Useful for researchers and developers |
| Complexity | ⭐⭐⭐☆☆ (3/5) - Moderate, ~400 lines of code |
| Maintainability | ⭐⭐⭐⭐☆ (4/5) - Follows existing patterns |

## Recommendation

✅ **Ready for experimental use** - The feature works as designed and provides value. Users can now:
- Estimate workflow execution time before running
- Identify which nodes might be bottlenecks
- Understand parallelization opportunities in their workflows

**Next steps if pursued:**
1. Store actual execution times from completed runs for more accurate estimates
2. Add comparison between estimated vs actual times
3. Export profiling reports as JSON
4. Integrate with ResultsStore for real execution data

## Files Modified/Created

- `web/src/stores/WorkflowProfilerStore.ts` (NEW)
- `web/src/components/node_editor/WorkflowProfiler.tsx` (NEW)
- `web/src/components/node_editor/ViewportStatusIndicator.tsx` (MODIFIED)
- `web/src/components/node_editor/NodeEditor.tsx` (MODIFIED)
- `web/src/config/shortcuts.ts` (MODIFIED)
- `web/src/components/node/ReactFlowWrapper.tsx` (MODIFIED)
- `.github/opencode-memory/features.md` (MODIFIED)
- `.github/opencode-memory/project-context.md` (MODIFIED)
- `.github/opencode-memory/insights/future/workflow-profiler.md` (NEW)
