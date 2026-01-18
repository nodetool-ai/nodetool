# Test File TypeScript Errors Fix (2026-01-18)

**Problem**: Multiple test files had TypeScript errors causing typecheck failures:
- `useCollectionDragAndDrop.test.ts` - Mock implementation type mismatch
- `useDuplicate.test.ts` - Type issues with mock nodes/edges
- `useNodeFocus.test.ts` - Mock store implementation type issues
- `useNumberInput.test.ts` - Wrong import path for NumberInput component
- `checkHfCache.test.ts` - Missing import for HfCacheCheckResponse type
- `ConnectableNodesStore.test.ts` - Incorrect TypeMetadata type names (input/output → type)
- `NodeMenuStore.test.ts` - Incorrect property names (type→node_type, category→title, name→title)
- `graphNodeToReactFlowNode.test.ts` - createMockWorkflow function not accepting arguments

**Solution**: Fixed type mismatches and property names across all affected test files.

**Files**:
- web/src/hooks/__tests__/useCollectionDragAndDrop.test.ts
- web/src/hooks/__tests__/useDuplicate.test.ts
- web/src/hooks/__tests__/useNodeFocus.test.ts
- web/src/hooks/__tests__/useNumberInput.test.ts
- web/src/serverState/__tests__/checkHfCache.test.ts
- web/src/stores/__tests__/ConnectableNodesStore.test.ts
- web/src/stores/__tests__/NodeMenuStore.test.ts
- web/src/stores/__tests__/graphNodeToReactFlowNode.test.ts

**Date**: 2026-01-18
