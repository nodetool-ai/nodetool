# Performance Optimization: Handler Memoization (2026-01-17)

## Summary

Fixed inline arrow functions creating new function references on every render in node and asset components. Added React.memo to asset table component.

## Changes Made

### 1. NodeHeader.tsx
**Fixed 4 inline arrow functions:**
- `handleOpenLogsDialog` - for opening logs badge button
- `handleShowResultsClick` - for "Show Result" toggle button
- `handleShowInputsClick` - for "Show Inputs" toggle button
- `handleCloseLogsDialog` - for closing NodeLogsDialog

**Before:**
```typescript
onClick={(e) => {
  e.stopPropagation();
  setLogsDialogOpen(true);
}}
```

**After:**
```typescript
const handleOpenLogsDialog = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  setLogsDialogOpen(true);
}, []);

onClick={handleOpenLogsDialog}
```

### 2. AssetTable.tsx
**Added React.memo wrapper:**
- Wrapped component with `memo()` to prevent re-renders when parent changes
- Added `handleAssetRemoveClick` callback to prevent inline arrow in render

**Before:**
```typescript
export default AssetTable;
```

**After:**
```typescript
const AssetTableMemo = memo(AssetTable);
export default AssetTableMemo;
```

### 3. FormatButton.tsx
**Fixed inline onMouseDown handler:**
- Added useCallback for mouse down event handler
- Component already used memo, but inline function created new refs

**Before:**
```typescript
onMouseDown={(event) => {
  event.preventDefault();
  event.stopPropagation();
  // handler logic
}}
```

**After:**
```typescript
const handleMouseDown = useCallback((event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  // handler logic
}, [actionId, onAction, format, onToggle, label]);

onMouseDown={handleMouseDown}
```

### 4. TableActions.tsx
**Major refactoring:**
- Wrapped component with `memo()` and added displayName
- Memoized all 5 inline handlers:
  - `handleCopyData`
  - `handleAddRow`
  - `handleDeleteRows`
  - `handleResetSorting`
  - `handleDeleteRowsClick`
  - `handleToggleSelect`
  - `handleToggleRowNumbers`

**Before:**
```typescript
onClick={() => {
  if (tabulator?.getSelectedRows().length) {
    handleDeleteRows();
  }
}}
```

**After:**
```typescript
const handleDeleteRowsClick = useCallback(() => {
  if (tabulator?.getSelectedRows().length) {
    handleDeleteRows();
  }
}, [tabulator, handleDeleteRows]);

onClick={handleDeleteRowsClick}
```

## Impact

**Performance Benefits:**
- Prevents unnecessary re-renders of child components when parent re-renders
- Stable function references passed to memoized children
- Reduced memory allocations from creating new function objects

**Components Fixed:**
- `NodeHeader.tsx` - Used in every node (high-frequency)
- `AssetTable.tsx` - Used in asset management
- `FormatButton.tsx` - Used in text editor toolbar
- `TableActions.tsx` - Used in data table output

## Files Modified

- `web/src/components/node/NodeHeader.tsx`
- `web/src/components/assets/AssetTable.tsx`
- `web/src/components/node/FormatButton.tsx`
- `web/src/components/node/DataTable/TableActions.tsx`

## Verification

- ✅ ESLint passes for modified files
- ✅ No new warnings introduced
- ✅ TypeScript compiles without new errors

## Pattern to Follow

```typescript
// ❌ Bad - creates new function on every render
onClick={() => handleAction(id)}

// ✅ Good - memoized callback
const handleActionClick = useCallback(() => handleAction(id), [id]);
onClick={handleActionClick}

// ❌ Bad - component re-renders on any parent change
export default Component;

// ✅ Good - only re-renders when props change
export default memo(Component);
```

## Date

2026-01-17
