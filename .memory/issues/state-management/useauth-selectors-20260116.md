# Performance Optimization Issues Fixed (2026-01-16)

## Issue: useAuth() Store Subscription Without Selectors

**Problem**: Components subscribing to entire `useAuth` store instead of selective state slices, causing unnecessary re-renders.

**Affected Files**:
- `web/src/components/buttons/GoogleAuthButton.tsx` (line 14)
- `web/src/components/menus/SettingsMenu.tsx` (line 73)
- `web/src/components/assets/AssetGrid.tsx` (line 122)

**Root Cause**: Using `const { user } = useAuth()` pattern subscribes to entire store state.

**Impact**: Components re-render on any auth state change (login, logout, token refresh, user profile updates).

**Solution**: Converted to selective Zustand selectors:
```typescript
const user = useAuth((state) => state.user);
```

**Status**: Fixed

---

## Issue: useLayoutStore Subscription Without Selectors

**Problem**: `LayoutMenu.tsx` subscribing to entire `useLayoutStore` via destructuring.

**Affected File**: `web/src/components/dashboard/LayoutMenu.tsx` (lines 30-36)

**Root Cause**: Using object destructuring from store selector.

**Impact**: Component re-renders when any layout store data changes, even if not used.

**Solution**: Converted to individual selectors:
```typescript
const layouts = useLayoutStore((state) => state.layouts);
const activeLayoutId = useLayoutStore((state) => state.activeLayoutId);
const addLayout = useLayoutStore((state) => state.addLayout);
const setActiveLayoutId = useLayoutStore((state) => state.setActiveLayoutId);
const updateActiveLayout = useLayoutStore((state) => state.updateActiveLayout);
```

**Status**: Fixed

---

## Issue: Large Dashboard Components Without Memoization

**Problem**: Dashboard components without `React.memo` re-rendering unnecessarily.

**Affected Files**:
- `web/src/components/dashboard/ExamplesList.tsx` (179 lines)
- `web/src/components/dashboard/LayoutMenu.tsx` (178 lines)

**Root Cause**: Components exported without memoization wrapper.

**Impact**: Components re-render when parent updates, even if props haven't changed.

**Solution**: Added `React.memo` wrapper:
```typescript
export default React.memo(ExamplesList);
export default React.memo(LayoutMenu);
```

**Status**: Fixed

---

## Performance Impact Summary

| Issue Type | Files Affected | Impact |
|------------|----------------|--------|
| useAuth() selectors | 3 files | Reduced re-renders on auth changes |
| useLayoutStore selectors | 1 file | Reduced re-renders on layout changes |
| Component memoization | 2 files | Prevents unnecessary re-renders |

**Total Files Fixed**: 5 files
**Total Optimizations**: 6 distinct performance improvements

**Verification**: All modified files pass linting without errors.
