# Inline Arrow Function Memoization (2026-01-17)

**Insight**: Memoized inline arrow functions using `useCallback` to prevent unnecessary re-renders in frequently-updating components.

## Problem

Inline arrow functions in JSX create new function references on every render:

```typescript
// ❌ Bad - creates new function on every render
onClick={() => handleAction(id)}
```

This causes child components to re-render even if their props haven't changed, especially when the child is wrapped with `React.memo`.

## Solution

Use `useCallback` to memoize the handler:

```typescript
// ✅ Good - stable function reference
const handleAction = useCallback(() => {
  doSomething(id);
}, [id]);

onClick={handleAction}
```

## Files Optimized

### web/src/components/node/ApiKeyValidation.tsx
- Memoized `handleOpenSettings` callback
- Prevents button re-renders when other state changes

### web/src/components/node/NodeOutputs.tsx
- Memoized `handleCloseDialog`, `handleValueChange`, `handleTypeChange`, `handleKeyDown`
- Prevents dialog re-renders on text input changes

### web/src/components/node/NodeExplorer.tsx
- Memoized `handleFilterChange`, `handleNodeClick`, `handleNodeEditClick`, `handleStopPropagation`
- Prevents list item re-renders during filtering

### web/src/components/node/NodeToolButtons.tsx
- Memoized `handleSelectOnAny`, `handleSelectZipAll`
- Prevents dropdown menu re-renders

### web/src/components/model_menu/ProviderList.tsx
- Memoized 9 callbacks (`handleSelectNull`, `handleSelectProvider`, `handleMenuOpen`, `handleMenuClose`, `handleOpenSettings`, `handleCheckboxChange`, `handleStopPropagation`, `handleOpenWebsite`, `handleToggleProvider`)
- Prevents list and menu re-renders

### web/src/components/dialogs/FileBrowserDialog.tsx
- Memoized `Row` component with `React.memo`
- Memoized `handleClick`, `handleDoubleClick` within Row
- Memoized `handleStartEditPath`, `handleRefresh`
- Prevents virtualized list re-renders

## Impact

- **Reduced re-renders**: Child components only re-render when their specific callbacks change
- **Better memoization**: Components wrapped with `React.memo` now benefit from stable prop references
- **Improved performance**: Especially noticeable in frequently-updating components like lists, dialogs, and menus

## Best Practices

1. **Always memoize callbacks passed to memoized children**
2. **Use inline arrow functions only for one-off handlers**
3. **Keep callback dependencies minimal and accurate**
4. **Use TypeScript to enforce dependency arrays**

## Date

2026-01-17
