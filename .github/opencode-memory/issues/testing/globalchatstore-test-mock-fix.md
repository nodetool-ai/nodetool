# GlobalChatStore Test Mock Fix

**Problem**: Two tests in GlobalChatStore.test.ts were failing due to incorrect mock setup for WebSocket connection failures.

**Root Cause**: The `ensureConnection` mock was configured to always resolve successfully (`mockResolvedValue(undefined)`), but tests expected it to fail when socket was not connected. The mock's `isConnectionOpen.mockReturnValue(false)` setting had no effect on `ensureConnection` behavior.

**Solution**: Updated both failing tests to use `mockRejectedValueOnce(new Error(...))` on the `ensureConnection` mock to properly simulate connection failures.

**Files**: web/src/stores/__tests__/GlobalChatStore.test.ts

**Tests Fixed**:
1. "sendMessage does nothing when socket is not connected" - Added `ensureConnection.mockRejectedValueOnce(new Error("Not connected"))`
2. "handles connection timeout gracefully" - Added `ensureConnection.mockRejectedValueOnce(new Error("Connection timeout"))`

**Date**: 2026-01-21
