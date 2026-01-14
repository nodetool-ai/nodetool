# StatusStore Type Safety Improvements

**Problem**: StatusStore used `any` types for node status, reducing TypeScript type safety and making it harder to understand what values were valid.

**Solution**: Created explicit types for node statuses:

```typescript
export type NodeStatus =
  | "booting"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "queued"
  | "timed_out"
  | "cancelled"
  | "suspended"
  | "paused"
  | "error"
  | "pending";

export type StatusValue = NodeStatus | { progress: number; message: string; timestamp: Date } | null;
```

Updated components to handle the new type properly:
- BaseNode.tsx extracts string status for components expecting `string`
- chatProtocol.ts and workflowUpdates.ts cast API status to StatusValue
- StatusStore.test.ts uses valid status values

**Files**:
- `web/src/stores/StatusStore.ts`
- `web/src/components/node/BaseNode.tsx`
- `web/src/core/chat/chatProtocol.ts`
- `web/src/stores/workflowUpdates.ts`
- `web/src/stores/__tests__/StatusStore.test.ts`

**Date**: 2026-01-14
