### Performance Optimization: Additional useAuth() Selective Selectors (2026-01-16)

**Issue**: Components were subscribing to entire `useAuth` store via destructuring instead of using selective state slices, causing unnecessary re-renders when any auth state changed.

**Measurement**: Components re-rendering on every auth state change (login, logout, token refresh) even when only checking specific fields like `user` or `state`.

**Solution**: Converted components to use individual Zustand selectors for selective subscriptions.

**Files Optimized**:
- `web/src/components/buttons/GoogleAuthButton.tsx` - Changed from `const { signInWithProvider, state } = useAuth()` to separate selectors for each property
- `web/src/components/menus/SettingsMenu.tsx` - Changed from `const { user } = useAuth()` to `const user = useAuth((state) => state.user)`
- `web/src/components/assets/AssetGrid.tsx` - Changed from `const { user } = useAuth()` to `const user = useAuth((state) => state.user)`

**Impact**: These components now only re-render when their specific auth data changes, not on every auth state update.

**Pattern**:
```typescript
// Before - subscribes to entire store
const { signInWithProvider, state } = useAuth();

// After - selective subscriptions
const signInWithProvider = useAuth((state) => state.signInWithProvider);
const state = useAuth((state) => state.state);
```

---

### Performance Optimization: Component Memoization (2026-01-16)

**Issue**: Large dashboard components were re-rendering unnecessarily when parent components updated.

**Solution**: Added `React.memo` to frequently-used dashboard components.

**Files Optimized**:
- `web/src/components/dashboard/ExamplesList.tsx` - Added `React.memo` wrapper (179 lines)
- `web/src/components/dashboard/LayoutMenu.tsx` - Added `React.memo` wrapper (178 lines)

**Impact**: Components only re-render when their props actually change, reducing unnecessary renders in the dashboard.

**Pattern**:
```typescript
export default React.memo(ExamplesList);
```

---

### Performance Optimization: LayoutStore Selective Selectors (2026-01-16)

**Issue**: `LayoutMenu.tsx` was subscribing to entire `useLayoutStore` via destructuring.

**Solution**: Converted to individual Zustand selectors.

**Files Optimized**:
- `web/src/components/dashboard/LayoutMenu.tsx` - Changed from destructuring 5 properties to 5 individual selectors

**Impact**: Reduced re-renders when layout store updates occur.

**Pattern**:
```typescript
// Before - subscribes to entire store
const { layouts, activeLayoutId, addLayout, setActiveLayoutId, updateActiveLayout } = useLayoutStore();

// After - selective subscriptions
const layouts = useLayoutStore((state) => state.layouts);
const activeLayoutId = useLayoutStore((state) => state.activeLayoutId);
const addLayout = useLayoutStore((state) => state.addLayout);
const setActiveLayoutId = useLayoutStore((state) => state.setActiveLayoutId);
const updateActiveLayout = useLayoutStore((state) => state.updateActiveLayout);
```

---

## Summary

**Total Files Optimized**: 5 files
- `web/src/components/buttons/GoogleAuthButton.tsx`
- `web/src/components/menus/SettingsMenu.tsx`
- `web/src/components/assets/AssetGrid.tsx`
- `web/src/components/dashboard/ExamplesList.tsx`
- `web/src/components/dashboard/LayoutMenu.tsx`

**Optimization Types**:
- 3 files: useAuth() selective selectors
- 1 file: useLayoutStore() selective selectors
- 2 files: React.memo component memoization

**Verification**:
- ✅ Lint: No lint errors in modified files
- ✅ TypeScript: Type checking passes (pre-existing test errors unrelated to changes)

**Impact**: Reduced unnecessary re-renders in authentication and dashboard components, improving overall UI responsiveness.
