# Performance Optimization: Component Memoization (2026-01-18)

## Summary

Added React.memo to 3 large components and memoized 10+ inline handlers across 5 components to prevent unnecessary re-renders.

## Changes

### Components Wrapped with React.memo

1. **Dashboard.tsx** (490 lines)
   - Added `memo()` wrapper with `displayName = "Dashboard"`
   - Prevents re-renders when unrelated state changes

2. **Terminal.tsx** (442 lines)
   - Added React import with `memo`
   - Wrapped component with `memo()` and `displayName = "Terminal"`
   - Prevents re-renders when terminal is not active

3. **NodeExplorer.tsx** (347 lines)
   - Added `memo` to imports
   - Wrapped component with `memo()` and `displayName = "NodeExplorer"`
   - Memoized callback factories for list item handlers

### Inline Handler Memoization

4. **ImageEditorToolbar.tsx**
   - Replaced 4 inline arrow functions with `handleToolSelect("toolName")` pattern
   - Removed unused `handleToolClick` callback
   - Handlers: select, crop, draw, erase tools

5. **NodeExplorer.tsx**
   - Created `handleNodeClickWrapper(nodeId)` callback factory
   - Created `handleNodeEditWrapper(nodeId)` callback factory
   - Prevents creating new functions on every render in `.map()` loop

6. **PanelLeft.tsx**
   - Memoized VerticalToolbar handlers: `handleWorkflowGridClick`, `handleAssetsClick`, `handleJobsClick`
   - Memoized `handleFullscreenClick` in PanelContent component
   - Prevents toolbar re-renders when panel content changes

## Impact

- **Reduced re-renders**: Large components only re-render when their props change
- **Improved list performance**: NodeExplorer list items no longer create new functions on each render
- **Better toolbar responsiveness**: PanelLeft toolbar buttons maintain stable references
- **Build verified**: All changes pass lint and build (5.77 MB bundle)

## Files Modified

- `web/src/components/dashboard/Dashboard.tsx`
- `web/src/components/terminal/Terminal.tsx`
- `web/src/components/node/NodeExplorer.tsx`
- `web/src/components/node/image_editor/ImageEditorToolbar.tsx`
- `web/src/components/panels/PanelLeft.tsx`

## Pattern Used

```typescript
// Callback factory pattern for list items
const handleNodeClickWrapper = useCallback(
  (nodeId: string) => () => {
    handleNodeClick(nodeId);
  },
  [handleNodeClick]
);

// Usage in map loop - stable reference
{entries.map((entry) => (
  <ListItemButton onClick={handleNodeClickWrapper(entry.node.id)}>
    ...
  </ListItemButton>
))}
```

This pattern prevents creating new arrow functions on each render while still allowing per-item callbacks.
