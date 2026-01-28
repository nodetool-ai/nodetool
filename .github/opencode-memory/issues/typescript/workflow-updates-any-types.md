# TypeScript Any Type Improvements in workflowUpdates.ts

**Problem**: The `workflowUpdates.ts` file had two instances of `any` types that reduced type safety:
1. `message: any` parameter in subscribe callback
2. `(job as any).run_state` cast for accessing untyped WebSocket data

**Solution**: 
1. Replaced `message: any` with the existing `MsgpackData` union type
2. Created a new `JobRunState` interface for proper type safety and replaced the `any` cast with a type-safe intersection

**Files**: `web/src/stores/workflowUpdates.ts`

**Date**: 2026-01-16
