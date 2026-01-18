# Research Report: Workflow Performance Profiler

## Summary

Implemented an experimental **Workflow Performance Profiler** feature for NodeTool that analyzes workflow structure to identify performance bottlenecks, complexity issues, and optimization opportunities. The feature uses static analysis of node types and connections to provide estimated metrics without requiring actual workflow execution.

## Implementation

### What Was Built

1. **WorkflowProfilerStore** - Zustand store managing analysis state, metrics, and suggestions
2. **useWorkflowProfiler** - Hook providing selective subscriptions and analysis functions
3. **WorkflowProfilerPanel** - MUI-based UI component with accordion sections for metrics, bottlenecks, and suggestions
4. **Analysis Algorithm** - Multi-pass algorithm calculating complexity, parallelism, and identifying issues

### Technical Approach

- Used existing Zustand patterns with `subscribeWithSelector` middleware
- Implemented memoized calculations for performance
- Created 5-tier severity/category system for issues
- Detected parallel execution opportunities via topological analysis

### Key Challenges

1. **TypeScript/ESLint Parsing**: Complex JSX modifications caused parser errors (TS1128) in PanelRight.tsx
2. **Import Issues**: `zustand/immer` module not available in this codebase
3. **State Integration**: Required coordinating with existing NodeStore for workflow data

## Findings

### What Works Well

- **Static Analysis**: Estimating complexity based on node types provides useful relative comparisons
- **Parallelism Detection**: Identifies independent node groups for potential concurrent execution
- **UI Design**: Accordion-based layout cleanly separates concerns (overview, bottlenecks, suggestions)

### What Doesn't Work

- **Estimates Are Rough**: Static analysis can't account for actual API latency or model load times
- **Limited Context**: Doesn't consider user-provided parameters that affect runtime
- **Integration Complexity**: Requires careful modifications to existing panel infrastructure

### Unexpected Discoveries

- The codebase uses minimal external dependencies (no immer middleware)
- ESLint parser is sensitive to indentation in JSX elements
- TypeScript errors can cascade unexpectedly when types change

## Evaluation

| Criteria | Rating | Notes |
|----------|--------|-------|
| Feasibility | ⭐⭐⭐⭐ | Frontend-only, uses existing patterns |
| Impact | ⭐⭐⭐⭐ | Useful for workflow optimization |
| Complexity | ⭐⭐⭐ | Moderate - requires careful integration |
| Maintainability | ⭐⭐⭐⭐ | Follows existing patterns |

## Recommendation

**Needs More Work**: The core analysis logic is sound, but integration with the existing UI requires refinement. The TypeScript/ESLint parsing issues suggest a need for a simpler integration approach.

### Required Next Steps

1. Simplify PanelRight.tsx integration (use smaller, targeted changes)
2. Add proper tests for the analysis algorithm
3. Consider making the panel a floating dialog instead of docked panel
4. Add execution time tracking to validate estimates

## Files Created/Modified

- `web/src/stores/WorkflowProfilerStore.ts` (NEW)
- `web/src/hooks/useWorkflowProfiler.ts` (NEW)
- `web/src/components/node_editor/WorkflowProfilerPanel.tsx` (NEW)
- `web/src/stores/RightPanelStore.ts` (MODIFIED - added "profiler" view type)
- `web/src/config/shortcuts.ts` (MODIFIED - added P shortcut)
- `web/src/hooks/useNodeEditorShortcuts.ts` (MODIFIED - added profiler toggle handler)
- `docs/research/WORKFLOW_PROFILER.md` (NEW)
- `.github/opencode-memory/insights/performance/workflow-profiler-implementation.md` (NEW)
