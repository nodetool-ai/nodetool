### Unnecessary Re-renders from Zustand Store Subscriptions (2026-01-11)

**Issue**: Components subscribing to entire Zustand stores instead of selective state slices, causing unnecessary re-renders.

**Problem Files**:
- `web/src/components/panels/WorkflowAssistantChat.tsx` - Used `useGlobalChatStore()` without selector
- `web/src/components/panels/AppHeader.tsx` - `ChatButton` used `useGlobalChatStore()` without selector
- `web/src/components/dashboard/WelcomePanel.tsx` - Used `useSettingsStore()` without selector
- `web/src/components/content/Welcome/Welcome.tsx` - Used `useSettingsStore()` without selector

**Solution**: Use selective Zustand selectors:

```typescript
// Bad - subscribes to entire store
const { settings, updateSettings } = useSettingsStore();

// Good - subscribes only to needed state
const settings = useSettingsStore((state) => state.settings);
const updateSettings = useSettingsStore((state) => state.updateSettings);
```

**Why**: When using `useStore()` without a selector, the component re-renders on ANY state change. Using selective selectors ensures components only re-render when the specific state they need changes.

**Impact**: Significant reduction in unnecessary re-renders, especially in the chat and workflow assistant components.

**Files Fixed (Original)**:
- `web/src/components/panels/WorkflowAssistantChat.tsx`
- `web/src/components/panels/AppHeader.tsx`
- `web/src/components/dashboard/WelcomePanel.tsx`
- `web/src/components/content/Welcome/Welcome.tsx`

**Additional Files Fixed (2026-01-16)**:
- `web/src/components/buttons/GoogleAuthButton.tsx` - useAuth() → individual selectors
- `web/src/components/assets/AssetGrid.tsx` - useAuth() → individual selector
- `web/src/components/menus/SettingsMenu.tsx` - useSettingsStore() object destructuring → 13 individual selectors

**Status**: ✅ RESOLVED - All identified components have been optimized with selective Zustand subscriptions.
