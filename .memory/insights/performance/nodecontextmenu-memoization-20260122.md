# Performance Optimization: NodeContextMenu Inline Arrow Functions (2026-01-22)

## Issue

The `NodeContextMenu.tsx` component had 3 inline arrow functions in JSX that created new function references on every render:

1. Line 46: `onClick={() => removeFromGroup([node as Node<NodeData>)])}`
2. Line 130: `onClick={() => handleSelectMode("on_any")}`
3. Line 146: `onClick={() => handleSelectMode("zip_all")}`

Additionally, the `handleSelectMode` function was not memoized with `useCallback`.

## Solution

Wrapped handlers with `useCallback` for stable function references:

1. Added `useCallback` import
2. Wrapped `handleSelectMode` with `useCallback`
3. Created `handleRemoveFromGroup`, `handleSyncModeOnAny`, `handleSyncModeZipAll` memoized callbacks
4. Replaced inline arrow functions with memoized handlers

## Files Modified

- `web/src/components/context_menus/NodeContextMenu.tsx`

## Pattern

```typescript
// Before - inline arrow function creates new reference
onClick={() => handleSelectMode("on_any")}

// After - memoized callback with stable reference
const handleSyncModeOnAny = useCallback(() => handleSelectMode("on_any"), [handleSelectMode]);
onClick={handleSyncModeOnAny}
```

## Impact

- Reduced re-renders in context menu components
- Stable function references improve menu opening performance
- Prevents child component re-renders when parent re-renders

## Verification

- TypeScript: Pass
- ESLint: Pass
