# Performance Optimization: Zustand Store Subscriptions (2026-01-21)

**What**: Fixed 4 components that were causing unnecessary re-renders by subscribing to entire Zustand stores or using object selectors.

## Issues Fixed

### 1. Object Selector Pattern (InlineModelDownload)
**Files**:
- `web/src/components/dashboard/GettingStartedPanel.tsx`
- `web/src/components/content/Welcome/Welcome.tsx`

**Problem**: Components used object selectors that create new objects on every render:
```typescript
// ❌ Bad - creates new object on every render
const { startDownload, downloads } = useModelDownloadStore((state) => ({
  startDownload: state.startDownload,
  downloads: state.downloads
}));
```

**Fix**: Use individual selectors:
```typescript
// ✅ Good - stable references
const startDownload = useModelDownloadStore((state) => state.startDownload);
const downloads = useModelDownloadStore((state) => state.downloads);
```

**Impact**: Components now only re-render when their specific data changes, not when any property in the store updates.

### 2. Full Store Destructuring
**Files**:
- `web/src/components/panels/NotificationButton.tsx`
- `web/src/components/workspaces/WorkspaceTree.tsx`
- `web/src/components/menus/FoldersSettingsMenu.tsx`

**Problem**: Components destructured entire stores without selectors:
```typescript
// ❌ Bad - subscribes to entire store
const { notifications, lastDisplayedTimestamp } = useNotificationStore();
const { setIsOpen } = useWorkspaceManagerStore();
```

**Fix**: Use individual selectors:
```typescript
// ✅ Good - subscribes only to needed state
const notifications = useNotificationStore((state) => state.notifications);
const setWorkspaceManagerOpen = useWorkspaceManagerStore((state) => state.setIsOpen);
```

**Impact**: These components now only update when their specific state slice changes.

## Performance Impact

- **NotificationButton**: Previously re-rendered on ANY notification store change (addNotification, removeNotification, clearAll, etc.)
- **WorkspaceTree**: Previously re-rendered on ANY workspace manager store change
- **FoldersSettingsMenu**: Previously re-rendered on ANY notification store change
- **InlineModelDownload (2 instances)**: Previously re-rendered when any download-related state changed

## Verification

- ✅ TypeScript: Web and Electron packages pass
- ✅ ESLint: All packages pass (1 pre-existing warning)
- ✅ Tests: 3138 tests pass

---

## Audit Summary (2026-01-21)

### Already Optimized (from previous work)
- ✅ Asset list virtualization (react-window)
- ✅ Workflow list virtualization (react-window)
- ✅ Model list virtualization (react-window)
- ✅ 50+ components already memoized with React.memo
- ✅ Selective Zustand subscriptions (most components)
- ✅ useCallback for event handlers (most components)
- ✅ useMemo for expensive calculations
- ✅ Memory leak prevention (proper cleanup in useEffect)
- ✅ Bundle optimization (code splitting, no lodash full imports, no moment.js)

### Remaining Opportunities (low priority)
- 50+ inline arrow functions in render could use useCallback (mostly in small/memoized components)
- Some very small components not memoized (acceptable)
- Chat message list could benefit from virtualization (complex, low priority)

### No Issues Found
- No memory leaks detected
- No full lodash imports
- No moment.js usage
- No expensive operations in render loops
