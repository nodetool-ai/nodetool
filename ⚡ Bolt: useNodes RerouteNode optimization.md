# ⚡ Bolt: useNodes RerouteNode optimization

## Description

**💡 What:**
Added `shallow` equality to the `useNodes` selector for `upstreamConnection` in `web/src/components/node/RerouteNode.tsx`.

**🎯 Why:**
Zustand's default equality function for `useNodes` is strict equality (`===`). The `upstreamConnection` selector returns a newly created object literal on every call:
```typescript
    return {
      sourceType: sourceNode.type,
      sourceData: sourceNode.data,
      sourceHandle: incoming.sourceHandle
    };
```
Without `shallow` equality, this causes `RerouteNode` components to re-render on *every single state update* in the node store (e.g., at 60fps during dragging), even when the `upstreamConnection` details are structurally identical, simply because a new object reference was returned.

**📊 Impact:**
Prevents `O(N)` re-renders of `RerouteNode` components during unrelated node/edge drag operations or data updates, directly improving UI responsiveness and reducing React component churn.

**🔬 Measurement:**
Run frontend performance tests and use React Profiler while dragging a node in a canvas containing multiple `RerouteNode` instances to verify they no longer re-render unnecessarily.

**🧪 Testing:**
- `make typecheck`
- `make lint`
- `make test`
- `cd web && npm run test -- performance`
