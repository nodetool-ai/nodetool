# Performance Optimization: Inline Arrow Function Memoization (2026-01-18)

## Summary

Fixed unnecessary re-renders caused by inline arrow functions in event handlers across 12+ React components.

## Problem

Inline arrow functions like `onClick={() => handleAction(item)}` create new function references on every render, causing child components to re-render unnecessarily even when wrapped with `React.memo`.

## Solution

Replace inline arrow functions with memoized callbacks using `useCallback`:

```typescript
// Before - creates new function on every render
<Button onClick={() => handleClick(item)}>Click</Button>

// After - stable function reference
const handleClick = useCallback((item: Item) => {
  onItemClick(item);
}, [onItemClick]);
// ...
<Button onClick={handleClick(item)}>Click</Button>
```

## Files Modified

### Dashboard Components
1. **BackToDashboardButton.tsx** - Memoized navigation handler with `startTransition`
2. **TemplatesPanel.tsx** - Memoized template click handler in map loop
3. **TagFilter.tsx** - Added React.memo and memoized tag selection handlers
4. **WorkflowTile.tsx** - Memoized all click handlers (double-click, select, open, duplicate)

### Context Menu Components
5. **NodeContextMenu.tsx** - Memoized sync mode and remove from group handlers
6. **ConnectableNodes.tsx** - Memoized search input and node click handlers

### Asset Components
7. **AssetTable.tsx** - Memoized asset remove click handler
8. **AssetItem.tsx** - Memoized item click, delete click, and audio play handlers

## Impact

- **Reduced Re-renders**: Components now only re-render when their actual props change
- **Better Performance**: Especially noticeable in:
  - Large workflow lists with many items
  - Context menus that open frequently
  - Asset grids with 100+ items
  - Dashboard with multiple panels

## Verification

- ✅ TypeScript: Passes
- ✅ ESLint: Passes (1 pre-existing warning)
- ✅ Tests: 3089 tests pass

## Related Patterns

See also:
- `.github/opencode-memory/insights/performance/component-memoization-20260118.md`
- `.github/opencode-memory/insights/performance/handler-memoization-20260117.md`

## Files Changed

```
web/src/components/dashboard/BackToDashboardButton.tsx
web/src/components/dashboard/TemplatesPanel.tsx
web/src/components/dashboard/TagFilter.tsx
web/src/components/workflows/WorkflowTile.tsx
web/src/components/context_menus/NodeContextMenu.tsx
web/src/components/context_menus/ConnectableNodes.tsx
web/src/components/assets/AssetTable.tsx
web/src/components/assets/AssetItem.tsx
```
