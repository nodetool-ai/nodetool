# GlobalChatStore Mock Fix

**Problem**: Two tests in `GlobalChatStore.test.ts` were failing:
- "sendMessage does nothing when socket is not connected" - expected `currentThreadId` to be null, got "id-0"
- "handles connection timeout gracefully" - expected error to be "Not connected to chat service", got null

**Solution**: Updated the `ensureConnection` mock implementation to throw an error when `isConnectionOpen()` returns false, matching the expected behavior in the tests.

**Files**: 
- `web/src/stores/__tests__/GlobalChatStore.test.ts` (line 36)

**Date**: 2026-01-21
