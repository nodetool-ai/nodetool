# UseSurroundWithGroup Lint Fix

**Problem**: ESLint warning "'SurroundWithGroupOptions' is defined but never used" because the type was defined but not used in the function signature.

**Solution**: Updated the function to use the defined type instead of an inline type:
```typescript
// Before:
const surroundWithGroup = useCallback(
  ({ selectedNodes }: { selectedNodes: Node<NodeData>[] }) => {

// After:
const surroundWithGroup = useCallback(
  ({ selectedNodes }: SurroundWithGroupOptions) => {
```

**Files**:
- web/src/hooks/nodes/useSurroundWithGroup.ts

**Date**: 2026-01-19
