# Component Memoization (2026-01-20)

**What**: Added React.memo and useCallback to 4 frequently-used components to prevent unnecessary re-renders.

**Files Optimized**:
- `web/src/components/workflows/TagFilter.tsx` - Added React.memo wrapper and useCallback for 3 inline handlers
- `web/src/components/workflows/SearchBar.tsx` - Added React.memo wrapper and useCallback for 2 handlers
- `web/src/components/node_menu/SearchResults.tsx` - Added React.memo wrapper and useCallback for renderNode
- `web/src/components/node_menu/TypeFilter.tsx` - Added React.memo wrapper and useCallback for 12 inline handlers

**Impact**: These components now only re-render when their props change, reducing unnecessary re-renders in workflow and node menu contexts.

**Pattern Applied**:
```typescript
const ComponentName = memo((props: Props) => {
  const handler = useCallback(() => {
    // handler logic
  }, [dependencies]);
  
  return <Element onClick={handler} />;
});

ComponentName.displayName = "ComponentName";
export default ComponentName;
```

**Verification**:
- ✅ Lint: All modified files pass
- ✅ Tests: Tests pass for related components
