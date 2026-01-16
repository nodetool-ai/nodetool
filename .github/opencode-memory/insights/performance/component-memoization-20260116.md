### Performance Optimization: Component Memoization and Callback Optimization (2026-01-16)

**Issue**: Dashboard components (WelcomePanel, GettingStartedPanel, ActivityPanel) were re-rendering unnecessarily when parent components updated, and inline arrow functions were creating new function references on every render.

**Measurement**: Components re-rendering on every parent update with inline handlers creating new function instances.

**Solution**: Added React.memo to export declarations and memoized callbacks with useCallback hooks.

**Files Optimized**:
- `web/src/components/dashboard/WelcomePanel.tsx`
  - Added React.memo to prevent unnecessary re-renders
  - Memoized sections array with useMemo
  - Memoized handleToggleWelcomeOnStartup with useCallback
  - Memoized highlightText with useCallback
  - Memoized renderContent with useCallback

- `web/src/components/dashboard/GettingStartedPanel.tsx`
  - Added React.memo to prevent unnecessary re-renders

- `web/src/components/dashboard/ActivityPanel.tsx`
  - Added React.memo to prevent unnecessary re-renders
  - Memoized handleTabChange with useCallback

**Impact**: Reduced unnecessary re-renders in dashboard panels by ensuring components only update when their specific props or state changes. Memoized callbacks prevent child components from re-rendering due to new function references.

**Pattern**:
```typescript
// Before - no memoization
const WelcomePanel: React.FC = () => {
  const handleToggleWelcomeOnStartup = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ showWelcomeOnStartup: event.target.checked });
  };
  // ...
  export default WelcomePanel;
};

// After - memoized
const WelcomePanel: React.FC = () => {
  const handleToggleWelcomeOnStartup = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updateSettings({ showWelcomeOnStartup: event.target.checked });
    },
    [updateSettings]
  );
  // ...
  export default React.memo(WelcomePanel);
};
```

---

### Performance Optimization: useMemo for Expensive Array Operations (2026-01-16)

**Issue**: Array operations (map) were running on every render for constant data.

**Measurement**: Array mapping operations running on every render even when source data hasn't changed.

**Solution**: Wrapped array operations in useMemo with empty dependency arrays.

**Files Optimized**:
- `web/src/components/dashboard/WelcomePanel.tsx`
  - Memoized sections array creation from overviewContents

**Impact**: Constant data arrays are now only computed once, not on every render.

**Pattern**:
```typescript
// Before - runs on every render
const sections: Section[] = overviewContents.map((section) => ({
  ...section,
  originalContent: section.content
}));

// After - memoized
const sections: Section[] = useMemo(() =>
  overviewContents.map((section) => ({
    ...section,
    originalContent: section.content
  })),
  []
);
```

---
