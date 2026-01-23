# TabPanel Component Memoization (2026-01-22)

**What**: Memoized TabPanel components across 4 files to prevent unnecessary re-renders.

**Why**: TabPanel components were re-rendering whenever their parent component re-rendered, even when the active tab hadn't changed. This caused unnecessary renders in settings menus, help dialogs, and welcome screens.

**Files Modified**:
- `web/src/components/menus/SettingsMenu.tsx`
- `web/src/components/content/Welcome/Welcome.tsx`
- `web/src/components/content/Help/Help.tsx`
- `web/src/components/hugging_face/RecommendedModelsDialog.tsx`

**Implementation**:
```typescript
// BEFORE: Functional component without memoization
function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div hidden={value !== index}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

// AFTER: Memoized functional component
const TabPanel = React.memo(function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div hidden={value !== index}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
});
```

**Impact**:
- TabPanel components now only re-render when their props (children, value, index) change
- Settings menu, help dialogs, and model dialogs have reduced re-render frequency
- Improved performance when switching tabs in settings and dialogs

**Pattern Used**:
- `React.memo()` for shallow prop comparison
- Preserved all existing functionality and accessibility attributes
- No breaking changes to component API

**Related**:
- `.github/opencode-memory/insights/component-memoization-20260119.md`
- `.github/opencode-memory/insights/component-memoization-20260120.md`
