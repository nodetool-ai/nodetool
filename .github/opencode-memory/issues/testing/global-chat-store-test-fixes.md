# GlobalChatStore Test Fixes

**Problem**: Two tests in GlobalChatStore.test.ts were failing because the mock `ensureConnection` function always resolved successfully, preventing the error handling code paths from being exercised.

**Solution**: Updated two tests to use `mockRejectedValueOnce` on `ensureConnection` to properly simulate connection failures:
1. "sendMessage does nothing when socket is not connected" 
2. "handles connection timeout gracefully"

**Files**: web/src/stores/__tests__/GlobalChatStore.test.ts

**Date**: 2026-01-21
