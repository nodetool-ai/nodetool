# Zustand Store Subscription Optimization - Additional Components

**Problem**: Components subscribing to entire Zustand stores via destructuring instead of selective state slices, causing unnecessary re-renders.

**Solution**: Converted components to use individual Zustand selectors for selective subscriptions.

**Files Fixed**:
- `web/src/hooks/useChatService.ts`
- `web/src/hooks/editor/useChatIntegration.ts`
- `web/src/components/chat/containers/GlobalChat.tsx`
- `web/src/components/chat/containers/StandaloneChat.tsx`

**Date**: 2026-01-13
