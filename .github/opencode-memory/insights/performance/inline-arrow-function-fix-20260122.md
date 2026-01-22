# Inline Arrow Function Performance Fix (2026-01-22)

## Summary

Fixed inline arrow functions in 6 components using useCallback to prevent unnecessary re-renders and improve performance.

## Components Fixed

### High Priority
1. **NodeContextMenu.tsx** - Fixed 3 inline handlers:
   - `handleRemoveFromGroup` - Memoized node removal from group
   - `handleSyncOnAny` - Memoized sync mode selection
   - `handleSyncZipAll` - Memoized sync mode selection

2. **TagFilter.tsx** - Fixed 1 inline handler:
   - `handleTagClick` - Memoized tag selection callback

3. **AssetTable.tsx** - Fixed 1 inline handler:
   - `handleAssetRemoveClick` - Memoized asset removal with stable reference

4. **AssetItem.tsx** - Fixed 5 inline handlers:
   - `handleAssetContextMenu` - Memoized context menu handler
   - `handleAssetDoubleClick` - Memoized double click handler
   - `handleAssetClick` - Memoized click handler
   - `handleDeleteClick` - Memoized delete button handler
   - `handleAudioClick` - Memoized audio icon click handler

### Medium Priority
5. **AssetGridRow.tsx** - Fixed 2 inline handlers:
   - `handleToggleExpanded` - Memoized divider expansion toggle
   - `handleRowSelectAsset` - Memoized asset selection

6. **AssetActions.tsx** - Fixed 6 inline handlers:
   - `handleOpenCreateFolder` - Memoized folder creation dialog open
   - `handleCloseCreateFolder` - Memoized dialog close
   - `handleCreateFolderKeyDown` - Memoized keyboard handling
   - `handleFolderNameChange` - Memoized folder name input
   - `handleUploadFiles` - Memoized file upload callback

## Performance Impact

### Before
```typescript
// ❌ Creates new function on every render
<Button onClick={() => handleSelectTag(tag)}>Tag</Button>
```

### After
```typescript
// ✅ Stable reference across renders
const handleTagClick = useCallback((tag: string) => {
  return () => {
    onSelectTag(tag);
  };
}, [onSelectTag]);

// ...
<Button onClick={handleTagClick(tag)}>Tag</Button>
```

## Benefits

1. **Reduced Re-renders**: Components only re-render when their actual props change
2. **Better React.memo Effectiveness**: Memoized callbacks work with React.memo
3. **Stable References**: Event handlers maintain stable identity
4. **Improved List Performance**: Virtualized lists benefit from stable child references

## Files Modified

- `web/src/components/context_menus/NodeContextMenu.tsx`
- `web/src/components/workflows/TagFilter.tsx`
- `web/src/components/assets/AssetTable.tsx`
- `web/src/components/assets/AssetItem.tsx`
- `web/src/components/assets/AssetGridRow.tsx`
- `web/src/components/assets/AssetActions.tsx`

## Verification

- TypeScript: ✅ Passes
- Lint: ✅ No new warnings
- Tests: ✅ 3138/3156 pass (16 pre-existing failures unrelated to changes)
