### Dashboard Component Memoization (2026-01-16)

**Issue**: Dashboard components (`WorkflowsList`, `WelcomePanel`) were re-rendering on every parent update even when their props hadn't changed.

**Solution**: Added `React.memo` with proper display names and `useCallback` for event handlers.

**Files Optimized**:
- `web/src/components/dashboard/WorkflowsList.tsx`:
  - Added `React.memo` wrapper
  - Added `useCallback` for `onWorkflowClick` handler to prevent new function creation on each render
  - Moved CSS styles into `useMemo` to prevent recreation on each render
  - Added proper `displayName` for debugging

- `web/src/components/dashboard/WelcomePanel.tsx`:
  - Added `React.memo` wrapper

**Impact**: Dashboard components now only re-render when their actual props change, reducing unnecessary renders in the main dashboard view.

**Pattern**:
```typescript
// Before - no memoization
const WorkflowsList: React.FC<WorkflowsListProps> = ({
  sortedWorkflows,
  handleWorkflowClick
}) => {
  return sortedWorkflows.map((workflow) => (
    <Box onClick={() => handleWorkflowClick(workflow)} />
  ));
};

// After - memoized with useCallback
const WorkflowsList = memo(({
  sortedWorkflows,
  handleWorkflowClick
}: WorkflowsListProps) => {
  const onWorkflowClick = useCallback((workflow: Workflow) => {
    handleWorkflowClick(workflow);
  }, [handleWorkflowClick]);

  return sortedWorkflows.map((workflow) => (
    <Box onClick={() => onWorkflowClick(workflow)} />
  ));
});
WorkflowsList.displayName = "WorkflowsList";
```

---

### Performance Audit Summary (2026-01-16)

**Completed Optimizations**:
1. Zustand selective subscriptions - 28+ components converted
2. Bundle code splitting - 55% reduction (12.77MB → 5.74MB)
3. Component memoization - Added React.memo to WorkflowsList, WelcomePanel
4. Handler memoization - Added useCallback for inline handlers
5. Expensive operations memoization - useMemo for sort/filter operations

**Verified Optimizations**:
- AssetGrid: Already uses memo + useCallback properly
- BaseNode: Already uses React.memo with custom comparison
- PropertyInput: Already uses React.memo with isEqual
- OutputRenderer: Already uses React.memo with isEqual
- NodeMenu: Already uses memo with useCallback
- ExampleGrid: Already uses react-window for virtualization

**Existing Performance Features**:
- React.memo on 35+ components
- useCallback for event handlers
- useMemo for expensive calculations
- Selective Zustand subscriptions
- Bundle code splitting with manual chunks
- Event listener cleanup in useEffect

**No Changes Needed**:
- Event listeners are properly cleaned up
- Lodash uses modular imports (lodash.debounce)
- Memory leaks prevented with proper useEffect cleanup

---

### Performance Status (2026-01-16)

**Bundle Size**: 5.74 MB (1.7 MB gzipped) - Well optimized with code splitting

**Virtualization**: 
- ExampleGrid uses react-window for workflow templates
- AssetGridRow/AssetItem use memoization
- No TanStack Virtual yet for asset grids (1000+ potential items)

**Memoization Status**:
- ✅ 35+ components use React.memo
- ✅ 28+ components use selective Zustand subscriptions
- ✅ Event handlers use useCallback
- ✅ Expensive operations use useMemo

**Remaining Opportunities**:
1. Asset grid virtualization for 1000+ assets
2. Continue adding React.memo to remaining dashboard components
3. Add useCallback to more inline handlers in frequently-updated components
