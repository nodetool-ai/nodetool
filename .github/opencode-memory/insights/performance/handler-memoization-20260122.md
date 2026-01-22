# Handler Memoization - Performance Optimization (2026-01-22)

## Issue

113 inline arrow functions were identified in onClick handlers across the codebase. These create new function instances on every render, causing unnecessary re-renders of child components.

## Solution

Fixed inline arrow functions in critical components by extracting them to `useCallback` hooks:

### PanelLeft.tsx
- Extracted `handleFullscreenClick`, `handleWorkflowGridClick`, `handleAssetsClick` to useCallback
- Prevents re-render of toolbar buttons when parent re-renders

### AssetItem.tsx
- Replaced `onClick={() => handleClick(...)}` with direct `onClick={handleClick}`
- Replaced `onClick={() => handleDelete()}` with `onClick={handleDelete}`
- Added `handleAudioClick` useCallback for audio asset click handler
- Prefixed unused props with underscore (`_onSelect`, `_onClickParent`) to silence lint

## Impact

- **Reduced re-renders**: Stable function references prevent unnecessary child updates
- **Better React.memo effectiveness**: Memoized components now properly short-circuit
- **Improved scroll performance**: Asset grid items re-render less frequently

## Files Changed

- `web/src/components/panels/PanelLeft.tsx`
- `web/src/components/assets/AssetItem.tsx`

## Pattern

```typescript
// Before: Creates new function on every render
<IconButton onClick={() => onViewChange("workflowGrid")} />

// After: Stable reference via useCallback
const handleWorkflowGridClick = useCallback(() => {
  onViewChange("workflowGrid");
}, [onViewChange]);
// ...
<IconButton onClick={handleWorkflowGridClick} />
```

## Verification

- ESLint passes with no warnings
- Build succeeds
