# StatusStore and ErrorStore Type Improvements

**Problem**: StatusStore and ErrorStore used `any` types for status and error values.

**Solution**: 
- StatusStore: Changed from `any` to `string | Record<string, unknown> | null | undefined` to support both string statuses ("running", "completed") and complex status objects with progress info.
- ErrorStore: Changed from `any` to `Error | string | null | Record<string, unknown>` to properly type error values.
- Updated dependent components (NodeStatus, NodeExecutionTime, NodeContent, NodeErrors, BaseNode) to handle the new types.

**Files**: 
- web/src/stores/StatusStore.ts
- web/src/stores/ErrorStore.ts
- web/src/components/node/NodeStatus.tsx
- web/src/components/node/NodeExecutionTime.tsx
- web/src/components/node/NodeContent.tsx
- web/src/components/node/NodeErrors.tsx
- web/src/components/node/BaseNode.tsx
- web/src/hooks/useSelectedNodesInfo.ts

**Date**: 2026-01-17
