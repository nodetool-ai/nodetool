# useMemo Optimizations for Component Performance (2026-01-16)

**Issue**: Multiple components were performing expensive operations (sort, reduce, filter, map) on every render without memoization, causing unnecessary re-computations.

**Components Optimized**:

1. **RecentChats.tsx** - Sorting and transforming threads on every render
   - Added `useMemo` for sorting 5 most recent threads
   - Impact: Prevents re-sorting when unrelated state changes

2. **StorageAnalytics.tsx** - Calculating storage metrics on every render
   - Added `useMemo` for reduce operation (total size calculation)
   - Added `useMemo` for filter operations (file/folder counts)
   - Impact: Prevents recalculation when assets haven't changed

3. **OverallDownloadProgress.tsx** - Computing download progress on every render
   - Added `useMemo` for two reduce operations (total bytes, downloaded bytes)
   - Impact: Prevents recalculation when downloads haven't changed

**Pattern Applied**:
```typescript
// ❌ Before - Expensive operation on every render
const totalSize = assets.reduce((sum, asset) => {
  const assetSize = (asset as any).size as number | undefined;
  return sum + (assetSize || 0);
}, 0);

// ✅ After - Memoized calculation
const { totalSize } = useMemo(() => {
  return assets.reduce((sum, asset) => {
    const assetSize = (asset as any).size as number | undefined;
    return sum + (assetSize || 0);
  }, 0);
}, [assets]);
```

**Files Changed**:
- `web/src/components/dashboard/RecentChats.tsx`
- `web/src/components/assets/StorageAnalytics.tsx`
- `web/src/components/hugging_face/OverallDownloadProgress.tsx`

**Verification**:
- ✅ Lint: All packages pass
- ✅ TypeScript: Web package passes
