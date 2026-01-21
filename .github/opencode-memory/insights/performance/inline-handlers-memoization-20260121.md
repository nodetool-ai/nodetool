# Performance Optimization: Inline Handlers Memoization (2026-01-21)

**What**: Memoized inline arrow functions in components to prevent unnecessary re-renders by ensuring stable function references across renders.

**Components Optimized**:

1. **WorkflowToolbar.tsx** (479 lines)
   - Replaced 4 inline arrow functions with memoized callbacks:
     - `onClick={() => toggleTag(tag)}` → `handleToggleTag(tag)`
     - `onClick={() => handleSortChange("date")}` → `handleSortByDate()`
     - `onClick={() => handleSortChange("name")}` → `handleSortByName()`
     - `onDelete={() => toggleTag(tag)}` → `handleDeleteTag(tag)`
   - Added 4 new useCallback hooks

2. **AssetTree.tsx** (254 lines)
   - Replaced inline handler `onClick={() => node.content_type === "folder" && toggleFolder(node.id)}` with `handleListItemClick(node)`
   - Memoized `toggleFolder` function with useCallback
   - Added `handleToggleFolder` and `handleListItemClick` callbacks

**Impact**:
- Components only create new function references when dependencies change
- Prevents child component re-renders when parent re-renders
- Particularly beneficial for list items rendered in maps (tags, folders)

**Pattern**:
```typescript
// Before - creates new function on every render
<MenuItem onClick={() => toggleTag(tag)}>{tag}</MenuItem>

// After - stable function reference
const handleToggleTag = useCallback((tag: string) => {
  toggleTag(tag);
}, [toggleTag]);
// ...
<MenuItem onClick={() => handleToggleTag(tag)}>{tag}</MenuItem>
```

**Files Changed**:
- `web/src/components/workflows/WorkflowToolbar.tsx`
- `web/src/components/assets/AssetTree.tsx`

**Verification**:
- ✅ TypeScript: Web package passes
- ✅ ESLint: Web package passes (1 pre-existing warning)
