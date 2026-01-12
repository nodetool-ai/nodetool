# ReactFlow Node Type Mismatches

**Problem**: TypeScript complains about ReactFlow node types not matching custom NodeData interface.

**Solution**: Use explicit type casting:
```typescript
const nodes = reactFlowNodes as Node<NodeData>[];
```

**Why**: ReactFlow's internal types are generic and don't know about our custom NodeData.

**Files**: `web/src/stores/NodeStore.ts`, ReactFlow-related components

**Date**: 2026-01-10
