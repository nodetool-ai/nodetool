# Performance Optimization: Inline Handler Memoization (2026-01-20)

**What**: Fixed 15+ inline arrow functions in onClick handlers that were creating new function references on every render.

**Problem**: Components were using inline arrow functions like `onClick={() => handleClick(id)}` which create a new function reference on every render, causing unnecessary re-renders of child components.

**Solution**: Memoized handlers using `useCallback` with proper dependency arrays, and for handlers inside map functions, created factory functions that return memoized callbacks.

**Files Optimized**:
1. `web/src/components/dashboard/BackToDashboardButton.tsx` - Memoized navigate handler
2. `web/src/components/context_menus/NodeContextMenu.tsx` - Memoized select mode and remove from group handlers
3. `web/src/components/context_menus/PaneContextMenu.tsx` - Memoized paste, fit view, add comment, add group, and favorite node handlers
4. `web/src/components/context_menus/ConnectableNodes.tsx` - Memoized node click handler with factory function
5. `web/src/components/workflows/WorkflowToolbar.tsx` - Memoized tag toggle handler with factory function
6. `web/src/components/workflows/TagFilter.tsx` - Memoized tag selection handler with factory function
7. `web/src/components/assets/AssetDeleteConfirmation.tsx` - Memoized dialog close handler
8. `web/src/components/assets/AssetMoveToFolderConfirmation.tsx` - Memoized dialog close and alert dismiss handlers
9. `web/src/components/assets/AssetRenameConfirmation.tsx` - Memoized dialog close, alert dismiss, and keydown handlers
10. `web/src/components/assets/AssetCreateFolderConfirmation.tsx` - Memoized dialog close, alert dismiss, and keydown handlers
11. `web/src/components/hugging_face/DownloadProgress.tsx` - Memoized cancel download handler (also fixed conditional hook call)

**Pattern for Map Functions**:
```typescript
// Factory function approach for map callbacks
const handleItemClickFactory = useCallback((item: Item) => {
  return () => handleItemClick(item);
}, [handleItemClick]);

// In render:
{items.map(item => (
  <Item onClick={handleItemClickFactory(item)} />
))}
```

**Impact**:
- Reduced unnecessary re-renders in menu components
- Improved responsiveness when opening/closing context menus
- Better performance when interacting with large asset lists
- Fixed React hook rules violations in DownloadProgress.tsx

**Verification**:
- TypeScript: Passes
- ESLint: Passes (0 errors, 2 warnings about dependency arrays)
