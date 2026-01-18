# Performance Optimization: Additional Component Memoization (2026-01-18)

## Issue

Two components had inline arrow functions that created new function references on every render, causing unnecessary re-renders of child components:

1. **PreviewImageGrid.tsx** (429 lines) - Image grid with selection and comparison features
2. **NodeExplorer.tsx** (347 lines) - Node list with filtering and navigation

## Optimization Applied

### 1. PreviewImageGrid.tsx

**Changes Made:**
- Added `React.memo` wrapper to prevent re-renders when props don't change
- Memoized inline handlers:
  - `handleTileDoubleClick` - replaces inline double-click handler
  - `handleTileClick` - replaces inline click handler for selection mode

**Before:**
```typescript
onDoubleClick={() => {
  if (!selectionMode && onDoubleClick) {
    onDoubleClick(idx);
  }
}}
onClick={(e) => {
  if (selectionMode) {
    toggleSelect(idx, e);
  }
}}
```

**After:**
```typescript
const handleTileDoubleClick = useCallback((index: number) => {
  if (!selectionMode && onDoubleClick) {
    onDoubleClick(index);
  }
}, [selectionMode, onDoubleClick]);

const handleTileClick = useCallback((index: number, event: React.MouseEvent) => {
  if (selectionMode) {
    toggleSelect(idx, e);
  }
}, [selectionMode, toggleSelect]);

// In render:
onDoubleClick={() => handleTileDoubleClick(idx)}
onClick={(e) => handleTileClick(idx, e)}
```

### 2. NodeExplorer.tsx

**Changes Made:**
- Added `React.memo` wrapper
- Memoized inline handlers:
  - `handleNodeButtonClick` - replaces stopPropagation + handleNodeEdit
  - `handleListItemClick` - replaces handleNodeClick call
  - `handleListItemContextMenu` - replaces handleNodeContextMenu call

**Before:**
```typescript
onClick={() => handleNodeClick(entry.node.id)}
onContextMenu={(event) => {
  handleNodeContextMenu(event, entry.node.id);
}}
// ...
onClick={(event) => {
  event.stopPropagation();
  handleNodeEdit(entry.node.id);
}}
```

**After:**
```typescript
const handleNodeButtonClick = useCallback(
  (event: React.MouseEvent, nodeId: string) => {
    event.stopPropagation();
    handleNodeEdit(nodeId);
  },
  [handleNodeEdit]
);

const handleListItemClick = useCallback((nodeId: string) => {
  handleNodeClick(nodeId);
}, [handleNodeClick]);

const handleListItemContextMenu = useCallback(
  (event: React.MouseEvent, nodeId: string) => {
    handleNodeContextMenu(event, nodeId);
  },
  [handleNodeContextMenu]
);
```

## Impact

- **Reduced Re-renders**: Child components (list items, tiles) now receive stable function references
- **Better Performance**: Especially noticeable when scrolling through large node lists or image grids
- **Memory Efficiency**: Fewer function allocations on each render cycle

## Files Modified

1. `web/src/components/node/PreviewImageGrid.tsx`
2. `web/src/components/node/NodeExplorer.tsx`

## Verification

- ✅ TypeScript compilation passes
- ✅ ESLint passes (no new warnings)
- ✅ All existing functionality preserved

## Related Optimizations

See also:
- `.github/opencode-memory/insights/performance/audit-2026-01-17.md` - Previous performance audit
- `.github/opencode-memory/insights/performance/handler-memoization-20260117.md` - Handler memoization patterns
- `.github/opencode-memory/insights/performance/component-memoization-20260117.md` - Component memoization patterns
