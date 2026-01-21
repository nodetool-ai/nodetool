# Test Fix - GlobalChatStore.test.ts Mock Issues

**Problem**: Two tests in GlobalChatStore.test.ts were failing:
1. "sendMessage does nothing when socket is not connected" - expected currentThreadId to be null but got "id-0"
2. "handles connection timeout gracefully" - expected error message but got null

**Root Cause**: The mock for `ensureConnection` always resolved successfully, even when `isConnectionOpen` returned false. The tests set `isConnectionOpen.mockReturnValue(false)` but the mock `ensureConnection` wasn't configured to throw.

**Solution**: 
1. Added `mockGlobalWebSocketManager.ensureConnection.mockRejectedValue(new Error("Not connected"))` to the first test
2. Added `mockGlobalWebSocketManager.ensureConnection.mockRejectedValue(new Error("Not connected to chat service"))` to the second test
3. Reset `ensureConnection.mockResolveValue(undefined)` in the beforeEach to ensure subsequent tests have a working mock

**Files**: web/src/stores/__tests__/GlobalChatStore.test.ts

**Date**: 2026-01-21
