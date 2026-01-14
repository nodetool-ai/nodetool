# TypeScript any Type Improvement - workflowUpdates.ts

**Problem**: WebSocket message handler in `workflowUpdates.ts` was using `any` type instead of the defined `MsgpackData` union type.

**Solution**: Changed `(message: any)` to `(message: MsgpackData)` on line 49 to use the proper type that already exists in the file.

**Files**: `web/src/stores/workflowUpdates.ts`

**Date**: 2026-01-14
