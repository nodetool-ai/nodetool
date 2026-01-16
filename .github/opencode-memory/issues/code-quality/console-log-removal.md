# Console Log Removal

**Problem**: Debug console.log statements were scattered throughout the codebase, using console.log instead of the project's established loglevel logging pattern.

**Solution**: Removed or replaced console.log statements with proper loglevel logging:

**Previous fixes (2026-01-15):**
1. `web/src/stores/workflowUpdates.ts:50` - Removed debug console.log
2. `web/src/stores/GlobalChatStore.ts:334` - Removed debug console.log
3. `web/src/stores/GlobalChatStore.ts:628` - Removed debug console.log
4. `web/src/stores/GlobalChatStore.ts:1104` - Removed debug console.log
5. `web/src/utils/createAssetFile.ts:172` - Replaced console.log with log.debug

**Additional fixes (2026-01-16):**
1. `web/src/stores/GlobalChatStore.ts:854` - Replaced console.error with log.error for Summarize API error
2. `web/src/stores/GlobalChatStore.ts:960` - Removed duplicate console.error (log.error already present)
3. `web/src/stores/GlobalChatStore.ts:1104` - Replaced console.log with log.debug for threads fetch debug
4. `web/src/lib/websocket/GlobalWebSocketManager.ts:132` - Replaced console.log with log.debug for message logging
5. `web/src/hooks/useEnsureChatConnected.ts:26` - Replaced console.log with log.debug for connection debug
6. `web/src/hooks/useInputMinMax.ts:46` - Replaced console.log with log.debug for node data debug
7. `web/src/core/chat/chatProtocol.ts:780` - Replaced console.log with log.debug for WebSocket message handling
8. `web/src/core/chat/chatProtocol.ts:804` - Replaced console.log with log.debug for job update logging
9. `web/src/core/chat/chatProtocol.ts:924` - Replaced console.log with log.debug for error message logging

**Files**:
- `web/src/stores/workflowUpdates.ts`
- `web/src/stores/GlobalChatStore.ts`
- `web/src/utils/createAssetFile.ts`
- `web/src/lib/websocket/GlobalWebSocketManager.ts`
- `web/src/hooks/useEnsureChatConnected.ts`
- `web/src/hooks/useInputMinMax.ts`
- `web/src/core/chat/chatProtocol.ts`

**Date**: 2026-01-15 (original), 2026-01-16 (additional fixes)
