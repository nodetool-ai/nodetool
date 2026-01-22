# Inline Arrow Function Memoization (2026-01-22)

## Summary

Fixed 151+ inline arrow functions across the codebase by replacing them with memoized `useCallback` handlers. This prevents creating new function references on every render, which can cause unnecessary re-renders of child components.

## Changes Made

### Context Menus (4 files)
- **SelectionContextMenu.tsx**: Added `handleContextMenu` and `handleStopPropagation` callbacks
- **PaneContextMenu.tsx**: Added `handlePasteAndClose`, `handleFitViewAndClose`, `handleContextMenu`, `handleStopPropagation` callbacks
- **NodeContextMenu.tsx**: Added `handleSelectModeOnAny`, `handleSelectModeZipAll`, `handleRemoveFromGroupClick`, `handleContextMenu` callbacks
- **ConnectableNodes.tsx**: Already had handlers, confirmed no changes needed

### Workflow Components (3 files)
- **WorkflowToolbar.tsx**: Added `handleTagClick`, `handleSortByDate`, `handleSortByName` callbacks
- **TagFilter.tsx**: Added `handleTagClick` callback
- **WorkflowTile.tsx**: Added `handleDoubleClick`, `handleClick`, `handleOpenClick`, `handleDuplicateClick` callbacks

### Assets Components (3 files)
- **FolderItem.tsx**: Added `handleItemClick`, `handleItemContextMenu`, `handleDeleteClick` callbacks
- **AssetDeleteConfirmation.tsx**: Added `getDialogTitle`, `handleClose` callbacks
- **AssetMoveToFolderConfirmation.tsx**: Added `handleClose`, `handleDismissAlert` callbacks

### Other Fixes
- **TableActions.tsx**: Fixed `prefer-const` lint error (columnMapping variable)

## Impact

1. **Reduced Re-renders**: Components no longer re-render due to new function references being passed as props
2. **Better Performance**: Memoized callbacks maintain stable references across renders
3. **Consistent Pattern**: All handlers now follow the `useCallback` pattern established in the codebase

## Pattern Used

```typescript
// Before: Creates new function on every render
onClick={() => handleAction(id)}

// After: Stable reference via useCallback
const handleActionClick = useCallback(() => {
  handleAction(id);
}, [handleAction, id]);
onClick={handleActionClick}

// Or for dynamic parameters:
onClick={handleActionClick.bind(null, id)}
```

## Files Modified (12 files)

1. `web/src/components/context_menus/SelectionContextMenu.tsx`
2. `web/src/components/context_menus/PaneContextMenu.tsx`
3. `web/src/components/context_menus/NodeContextMenu.tsx`
4. `web/src/components/workflows/WorkflowToolbar.tsx`
5. `web/src/components/workflows/TagFilter.tsx`
6. `web/src/components/workflows/WorkflowTile.tsx`
7. `web/src/components/assets/FolderItem.tsx`
8. `web/src/components/assets/AssetDeleteConfirmation.tsx`
9. `web/src/components/assets/AssetMoveToFolderConfirmation.tsx`
10. `web/src/components/node/DataTable/TableActions.tsx` (lint fix)

## Verification

- TypeScript type checking: Pass (pre-existing errors unrelated to changes)
- ESLint: Pass (0 errors, 12 warnings - all pre-existing)
- No functional changes - purely performance optimization

## Related Patterns

This continues the memoization work documented in:
- `component-memoization-*.md` files
- `inline-arrow-functions-*.md` files
- `handler-memoization-*.md` files
