# React Memoization Performance Improvements (2026-01-20)

## Summary

Applied React memoization patterns to prevent unnecessary re-renders in frequently-used components.

## Changes Made

### NotificationsList.tsx
- **Issue**: Sort operation on notifications array happening on every render
- **Fix**: Wrapped sort and slice operations in `useMemo` to only recompute when notifications change
- **Impact**: Notifications list only re-sorts when actual notification data changes, not on parent re-renders

### PaneContextMenu.tsx
- **Issue**: Multiple inline arrow functions creating new function references on every render
- **Fixes**:
  - Memoized `handlePasteWithClose`, `handleFitViewWithClose`, `handleAddCommentWithClose`, `handleAddGroupWithClose`
  - Memoized `handleFavoriteClick`, `handleFavoriteNodeClick`, `handleConstantNodeClick`, `handleConstantNodeItemClick`, `handleInputNodeClick`, `handleInputNodeItemClick`
  - Memoized `addComment`, `addGroupNode`, `addFavoriteNode` helper functions
  - Removed inline arrow functions in map callbacks
- **Impact**: Context menu opens/closes without triggering re-renders of parent components

### WorkflowList.tsx
- **Issue**: Inline arrow functions for dialog handlers and toolbar actions
- **Fixes**:
  - Memoized `handleDeleteDialogClose`, `handleEditDialogClose`, `handleToggleCheckboxes`, `handleBulkDelete`
- **Impact**: Workflow list toolbar and dialogs use stable function references

### AssetTable.tsx
- **Issue**: Inline arrow function in onClick handler creating new references
- **Fix**: Created `handleRemoveAssetClick` factory function to return stable callbacks
- **Impact**: Asset table rows don't re-render when other state changes

### TagFilter.tsx
- **Issue**: Inline arrow function in map callback for tag buttons
- **Fix**: Created `handleTagClick` factory function to return stable callbacks
- **Impact**: Tag filter component only re-renders when tags actually change

## Performance Impact

1. **Reduced Re-renders**: Components now only re-render when their specific props change
2. **Stable References**: Event handlers maintain stable references across renders
3. **Better React.memo Effectiveness**: Memoized components benefit from proper equality checks

## Pattern Applied

```typescript
// Before: Creates new function on every render
<Button onClick={() => handleClick(id)} />

// After: Memoized callback with stable reference
const handleClick = useCallback(() => doSomething(id), [id]);
<Button onClick={handleClick} />

// Alternative: Factory function for callback with arguments
const handleClickWithId = useCallback(
  (id: string) => () => doSomething(id),
  [id]
);
<Button onClick={handleClickWithId(id)} />
```

## Files Modified

- `web/src/components/node_editor/NotificationsList.tsx`
- `web/src/components/context_menus/PaneContextMenu.tsx`
- `web/src/components/workflows/WorkflowList.tsx`
- `web/src/components/assets/AssetTable.tsx`
- `web/src/components/workflows/TagFilter.tsx`

## Verification

- TypeScript compilation: Passes
- ESLint: Passes (no warnings)
- No functional changes to behavior
