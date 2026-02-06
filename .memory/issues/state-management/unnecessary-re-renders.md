### Unnecessary Re-renders

**Issue**: Component re-renders too often, causing performance issues.

**Solution**: Use Zustand selectors properly:
```typescript
// Bad - subscribes to entire store
const store = useNodeStore();
const node = store.nodes[nodeId];

// Good - subscribes only to this node
const node = useNodeStore(state => state.nodes[nodeId]);
```
