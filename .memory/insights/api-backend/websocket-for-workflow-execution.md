# WebSocket for Workflow Execution

**Insight**: Workflows execute via WebSocket for real-time streaming results.

**Why**: 
- HTTP requests don't support streaming updates
- WebSocket allows bidirectional communication
- Results stream as they're generated

**Pattern**: Connect to WebSocket, send workflow, receive progress events.

**File**: Backend integration in `web/src/lib/WebSocketService.ts`

**Date**: 2026-01-10
