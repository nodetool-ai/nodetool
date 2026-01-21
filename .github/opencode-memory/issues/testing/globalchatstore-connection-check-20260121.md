# GlobalChatStore Test Failures Fix

**Problem**: Two tests failing in GlobalChatStore.test.ts due to sendMessage not checking connection status before creating threads

**Tests Fixed**:
1. "sendMessage does nothing when socket is not connected" (line 787)
2. "handles connection timeout gracefully" (line 1068)

**Solution**: Added explicit check for `isConnectionOpen()` before attempting to connect or create threads in GlobalChatStore.ts

**Files**: 
- web/src/stores/GlobalChatStore.ts
- web/src/stores/__tests__/GlobalChatStore.test.ts

**Date**: 2026-01-21

**Change**:
Added early return when socket is not connected:
```typescript
// Check if WebSocket connection is already established
if (!globalWebSocketManager.isConnectionOpen()) {
  set({ error: "Not connected to chat service" });
  return;
}
```

**Impact**: Tests now pass and the store properly validates connection status before attempting operations.
