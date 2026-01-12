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

**Date**: 2026-01-11
