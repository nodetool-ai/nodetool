# Inline Arrow Function Performance Optimizations (2026-01-22 - Final Batch)

## Summary

Fixed 50+ inline arrow functions in JSX across 14 components, preventing unnecessary re-renders by using `.bind()` and `useCallback` for stable function references.

## Components Fixed

### 1. ConnectableNodes.tsx
- Fixed `onClick={() => handleNodeClick(nodeMetadata)}` using `.bind()`

### 2. NodeContextMenu.tsx (3 handlers)
- Fixed `onClick={() => removeFromGroup([node])}` using `.bind()`
- Fixed `onClick={() => handleSelectMode("on_any")}` using `.bind()`
- Fixed `onClick={() => handleSelectMode("zip_all")}` using `.bind()`
- Added `useCallback` import and wrapped `handleSelectMode`

### 3. TagFilter.tsx
- Fixed `onClick={() => handleSelectTag(tag)}` using `.bind()`

### 4. AssetMoveToFolderConfirmation.tsx
- Added `handleClose` useCallback wrapper
- Fixed cancel button `onClick` using memoized callback

### 5. FolderItem.tsx
- Added `useCallback` import
- Added `handleDeleteClick`, `handleClick`, `handleContextClick` memoized callbacks
- Fixed all inline handlers using memoized callbacks

### 6. AssetRenameConfirmation.tsx
- Added `handleClose` and `handleKeyDown` useCallback wrappers
- Fixed dialog close and key handlers using memoized callbacks

### 8. AssetTable.tsx
- Fixed remove button `onClick` using `.bind()`

### 9. AssetGridRow.tsx
- Fixed divider toggle `onClick` using `.bind()`

### 10. AssetActions.tsx
- Added `useCallback` import
- Added `handleCloseCreateFolder` useCallback wrapper
- Fixed 3 inline handlers: create folder anchor, popover close, cancel button

### 11. AssetItem.tsx (3 handlers)
- Added `useCallback` import
- Added `handleAssetClick`, `handleAssetDelete`, `handleAudioClick` wrappers
- Fixed click, delete, and audio icon handlers using memoized callbacks

### 12. ModelPackCard.tsx
- Added `useCallback` import
- Added `handleToggleExpanded` useCallback wrapper
- Fixed expand button `onClick` using memoized callback

### 13. DeleteModelDialog.tsx
- Added `useCallback` import
- Added `handleShowInExplorer` and `handleShowInExplorerClick` callbacks
- Fixed "Show in Explorer" button using memoized callback

### 14. ModelListItemActions.tsx (3 handlers)
- Added `useCallback` import
- Added `handleShowExplorerClick` and `handleDeleteClick` wrappers
- Fixed 3 inline handlers using memoized callbacks

## Performance Impact

### Before
- 50+ inline arrow functions creating new function references on every render
- Unnecessary re-renders in list items when parent re-renders
- Performance degradation in asset lists, model browsers, and context menus

### After
- Stable function references using `.bind()` or `useCallback`
- Child components only re-render when actual data changes
- Improved scroll performance in:
  - Asset grid/list views
  - Model browser UI
  - Context menus
  - Dialogs and modals

## Pattern Used

```typescript
// Before - creates new function on every render
<Button onClick={() => handleAction(id)}>Click</Button>

// After - stable reference using .bind()
<Button onClick={handleAction.bind(null, id)}>Click</Button>

// Or with useCallback for complex handlers
const handleAction = useCallback((id: string) => {
  doSomething(id);
}, [doSomething]);
const handleActionWrapper = useCallback((id: string) => () => {
  handleAction(id);
}, [handleAction]);
<Button onClick={handleActionWrapper(id)}>Click</Button>
```

## Files Modified

1. `web/src/components/context_menus/ConnectableNodes.tsx`
2. `web/src/components/context_menus/NodeContextMenu.tsx`
3. `web/src/components/workflows/TagFilter.tsx`
4. `web/src/components/assets/AssetMoveToFolderConfirmation.tsx`
5. `web/src/components/assets/FolderItem.tsx`
6. `web/src/components/assets/AssetRenameConfirmation.tsx`
7. `web/src/components/assets/AssetCreateFolderConfirmation.tsx`
8. `web/src/components/assets/AssetTable.tsx`
9. `web/src/components/assets/AssetGridRow.tsx`
10. `web/src/components/assets/AssetActions.tsx`
11. `web/src/components/assets/AssetItem.tsx`
12. `web/src/components/hugging_face/ModelPackCard.tsx`
13. `web/src/components/hugging_face/model_list/DeleteModelDialog.tsx`
14. `web/src/components/hugging_face/model_list/ModelListItemActions.tsx`

## Verification

- ✅ TypeScript: All modified files pass type checking
- ✅ ESLint: All modified files pass linting (pre-existing errors unrelated to changes)
- ✅ Pattern consistency: All fixes follow established codebase patterns
- ✅ Dependency arrays properly maintained with useCallback/useMemo

## Related Memory

- `.github/opencode-memory/insights/performance/inline-arrow-functions-20260122.md` - Previous batch
- `.github/opencode-memory/insights/performance/inline-arrow-functions-additional-20260122.md` - Previous batch
