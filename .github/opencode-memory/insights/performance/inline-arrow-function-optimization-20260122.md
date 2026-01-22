# Inline Arrow Function Optimization Performance Fix (2026-01-22)

## Issue

Components had inline arrow functions in `onClick` handlers that created new function references on every render:

```typescript
// ❌ Bad - creates new function on every render
onClick={() => handleToolClick("select")}

// ✅ Good - stable function reference
onClick={handleToolClickSelect}
```

This causes unnecessary re-renders of child components when the parent re-renders, even if the handler doesn't actually change.

## Files Fixed

### Node Components
1. **ImageEditorToolbar.tsx** - Fixed 4 inline handlers for tool selection (select, crop, draw, erase)
2. **NodeExplorer.tsx** - Fixed 3 inline handlers for node click, context menu, and edit actions
3. **NodeContextMenu.tsx** - Fixed 3 inline handlers for remove from group, sync mode selection

### Context Menu Components
4. **ConnectableNodes.tsx** - Fixed 1 inline handler for node selection
5. **TagFilter.tsx** - Fixed 1 inline handler for tag selection

## Optimization Pattern

Used `useCallback` with handler factory pattern:

```typescript
// Create memoized handler
const handleToolClickSelect = useCallback(() => 
  handleToolClick("select"), 
[handleToolClick]);

// Or create factory for dynamic handlers
const createNodeClickHandler = useCallback(
  (nodeId: string) => () => handleNodeClick(nodeId),
  [handleNodeClick]
);

// Usage in JSX
onClick={handleToolClickSelect}
onClick={createNodeClickHandler(nodeId)}
```

## Performance Impact

- **Reduced Re-renders**: Components only re-render when props actually change
- **Better Scroll Performance**: List items in NodeExplorer and ConnectableNodes no longer re-render unnecessarily
- **Improved Context Menu**: Context menus open/close smoothly without unnecessary re-renders
- **Stable References**: Event handlers maintain stable references across renders

## Verification

- All components already use `React.memo` for additional re-render prevention
- Handler dependencies are properly tracked to ensure correctness
- No functional changes - only performance optimizations

## Related Files

- `.github/opencode-memory/insights/performance/component-memoization-20260119.md`
- `.github/opencode-memory/insights/performance/inline-arrow-function-memoization-20260117.md`
- `.github/opencode-memory/issues/state-management/unnecessary-re-renders-zustand-store.md`
