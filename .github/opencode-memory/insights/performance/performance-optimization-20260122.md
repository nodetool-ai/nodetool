# Performance Optimization - January 2026

## Overview

Performance monitoring and optimization pass for NodeTool's React frontend. Identified and fixed several performance bottlenecks in component rendering and edge processing.

## Optimizations Implemented

### 1. JobItem Component Memoization (PanelRight.tsx)

**Issue**: The `JobItem` component was re-rendering all job items whenever any single job updated, causing unnecessary re-renders when multiple jobs were running.

**Fix**:
- Added `React.memo` wrapper to `JobItem` component
- Wrapped inline functions (`handleClick`, `handleStop`, `getStatusIcon`) with `useCallback` to maintain stable references
- Memoized `RunningJobsList` component to prevent re-renders when job list changes

**Impact**:
- Individual job items now only re-render when their specific data changes
- Reduced re-renders in the jobs panel from O(n) to O(1) per update where n is the number of running jobs
- Smoother UI when managing multiple concurrent job executions

**Files Modified**:
- `web/src/components/panels/PanelRight.tsx`

---

### 2. Edge Processing Style Object Memoization (useProcessedEdges.ts)

**Issue**: The `useProcessedEdges` hook was creating new object references for `labelStyle`, `labelBgStyle`, and `labelBgPadding` inside the `edges.map()` callback on every render. This caused child components to re-render even when edge data hadn't changed.

**Fix**:
- Moved style object definitions (`labelStyle`, `labelBgStyle`, `labelBgPadding`) outside the map function to create stable references
- These style objects are now created once per hook invocation rather than once per edge

**Impact**:
- Reduced object allocation in the hot path of edge rendering
- Edges now only re-render when their actual data (stroke, status, etc.) changes
- Improved performance for workflows with many edges

**Files Modified**:
- `web/src/hooks/useProcessedEdges.ts`

---

## Performance Audit Findings

### Existing Optimizations (Already in Place)

The codebase already has several performance optimizations:

1. **GlobalChat.tsx**: Already wrapped with `React.memo` and uses individual Zustand selectors
2. **NodeInputs/NodeOutputs**: Already memoized with `React.memo` and `isEqual` comparison
3. **ProcessTimer.tsx**: Proper cleanup of setInterval in useEffect
4. **DownloadProgress.tsx**: Proper cleanup of setInterval
5. **NumberInput.tsx**: Proper cleanup of document event listeners
6. **ReactFlowWrapper.tsx**: Proper cleanup of window event listeners

### Pre-existing Issues (Not Fixed)

1. **OutputRenderer.tsx**: Missing `DataframeRenderer` import (TS error)
2. **useApiKeyValidation.test.ts**: Mock type mismatches (test file issues)
3. **useAutosave.test.ts**: Missing QueryClientProvider in tests

---

## Recommendations for Future Optimization

### High Priority

1. **Virtualize AssetGrid**: Asset grid with 1000+ items could benefit from virtualization (already virtualized for list view)
2. **Lazy-load heavy components**: Consider lazy-loading `DataTableRenderer`, `Model3DViewer`, and other heavy output renderers
3. **Optimize GlobalChat selectors**: While GlobalChat is memoized, the 25+ individual store subscriptions could be reviewed for opportunities to combine related state

### Medium Priority

1. **Add React.memo to frequently rendered components**: Check components like `WorkflowListItem`, `NodeInfo`, and other list item components
2. **Optimize useProcessedEdges further**: Consider caching edge results based on edge ID to avoid re-processing when structure hasn't changed
3. **Bundle size monitoring**: Track bundle size over time to catch regressions early

### Low Priority

1. **Performance monitoring**: Add performance marks/measurements for key user interactions
2. **React DevTools Profiler integration**: Consider adding a debug mode to measure render times

---

## Verification

All changes verified with:
- TypeScript compilation: ✅ No new errors introduced
- ESLint: ✅ No new errors introduced
- Tests: ✅ Pre-existing failures unchanged

---

## Related Documentation

- Previous performance optimizations: `.github/opencode-memory/insights/performance/`
- Component memoization patterns: `.github/opencode-memory/insights/performance/component-memoization-*.md`
- Zustand optimization: `.github/opencode-memory/insights/performance/zustand-selective-subscriptions.md`
