# Unnecessary Re-renders from Zustand Store Subscriptions

**Problem**: Components subscribing to entire Zustand stores instead of selective state slices, causing unnecessary re-renders.

**Solution**: Use selective Zustand selectors:

```typescript
// ❌ Bad - subscribes to entire store
const { settings, updateSettings } = useSettingsStore();

// ✅ Good - subscribes only to needed state
const settings = useSettingsStore((state) => state.settings);
const updateSettings = useSettingsStore((state) => state.updateSettings);
```

**Why**: When using `useStore()` without a selector, the component re-renders on ANY state change. Using selective selectors ensures components only re-render when the specific state they need changes.

**Impact**: Significant reduction in unnecessary re-renders, especially in the chat and workflow assistant components.

**Files**:
- `web/src/components/panels/WorkflowAssistantChat.tsx`
- `web/src/components/panels/AppHeader.tsx`
- `web/src/components/dashboard/WelcomePanel.tsx`
- `web/src/components/content/Welcome/Welcome.tsx`

**Date**: 2026-01-11
