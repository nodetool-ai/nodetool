# Zustand Selective Subscriptions Prevent Re-renders

**Insight**: Converting components from subscribing to entire Zustand stores to using selective selectors significantly reduces unnecessary re-renders.

**Pattern**:
```typescript
// ❌ Bad - subscribes to entire store
const { status, progress, threads } = useGlobalChatStore();

// ✅ Good - subscribes only to needed state
const status = useGlobalChatStore((state) => state.status);
const progress = useGlobalChatStore((state) => state.progress);
const threads = useGlobalChatStore((state) => state.threads);
```

**Why It Matters**:
- Components using entire store subscriptions re-render on ANY state change
- Chat and workflow components frequently update state (status, progress, messages)
- Selective subscriptions ensure components only update when their specific data changes

**Impact Measured**:
- `WorkflowAssistantChat`: 18 store properties → 17 individual selectors
- `ChatButton`: 3 store properties → 3 individual selectors
- `WelcomePanel`: 2 store properties → 2 individual selectors
- `Welcome`: 2 store properties → 2 individual selectors

**Files**: 
- `web/src/components/panels/WorkflowAssistantChat.tsx`
- `web/src/components/panels/AppHeader.tsx`
- `web/src/components/dashboard/WelcomePanel.tsx`
- `web/src/components/content/Welcome/Welcome.tsx`

---

### Additional Selective Subscriptions (2026-01-16)

**Issue**: Components still using full store destructuring causing unnecessary re-renders.

**Files Optimized**:
- `web/src/components/buttons/GoogleAuthButton.tsx` - Converted `const { signInWithProvider, state } = useAuth()` to individual selectors
- `web/src/components/assets/AssetGrid.tsx` - Converted `const { user } = useAuth()` to `const user = useAuth((state) => state.user)`
- `web/src/components/menus/SettingsMenu.tsx` - Converted object destructuring pattern to 13 individual selectors

**Pattern Applied**:
```typescript
// Before - creates new object on every render
const { user } = useAuth();

// After - stable reference, only re-renders when user changes
const user = useAuth((state) => state.user);
```

**Impact**: Prevents re-renders when unrelated auth state changes (e.g., session refresh, token updates).

**Date**: 2026-01-16
