# Memoization Strategy

**Insight**: Use `useMemo` for expensive calculations, not object references.

**Why**: 
- `useMemo` for objects/arrays doesn't prevent re-renders effectively
- Better to use Zustand selectors for stable references
- Reserve `useMemo` for expensive computations (sorting, filtering, calculations)

**Pattern**:
```typescript
// ❌ Bad - doesn't help
const config = useMemo(() => ({ id, name }), [id, name]);

// ✅ Good - expensive calculation
const sortedNodes = useMemo(() => 
  nodes.sort((a, b) => a.position.x - b.position.x),
  [nodes]
);
```

**Date**: 2026-01-10
