# Zustand Temporal (Undo/Redo) Issues

**Problem**: Undo/redo not working for certain state changes.

**Solution**: Ensure temporal middleware is properly configured:
```typescript
const useStore = create<State>()(
  temporal(
    (set) => ({
      // state and actions
    }),
    { limit: 50 } // optional: limit history
  )
);
```

**Date**: 2026-01-10
