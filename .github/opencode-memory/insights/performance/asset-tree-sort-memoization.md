### AssetTree Sort Memoization (2026-01-19)

**What**: Memoized sort operation in AssetTree component using useMemo and useCallback to prevent unnecessary sorting on re-renders.

**Files**: web/src/components/assets/AssetTree.tsx

**Impact**: Asset tree sorting now only happens when the asset tree data changes, not on every component re-render. Component is now memoized with React.memo.

**Implementation**:
- Added `sortNodes` callback using `useCallback` with stable reference
- Created `sortedAssetTree` using `useMemo` that depends on assetTree and sortNodes
- Wrapped component with `React.memo` to prevent re-renders when parent updates
- Removed inline sort from render function, using pre-sorted tree instead

**Pattern**:
```typescript
const sortNodes = useCallback((nodes: AssetTreeNode[]): AssetTreeNode[] => {
  return [...nodes].sort((a, b) => {
    if (a.content_type === "folder" && b.content_type !== "folder") return -1;
    if (a.content_type !== "folder" && b.content_type === "folder") return 1;
    return a.name.localeCompare(b.name);
  });
}, []);

const sortedAssetTree = useMemo(() => sortNodes(assetTree), [assetTree, sortNodes]);
```

**Verification**:
- ✅ Lint: Passes
- ✅ TypeScript: Passes
- ✅ Tests: 3089/3092 pass (3 skipped, unrelated to changes)
