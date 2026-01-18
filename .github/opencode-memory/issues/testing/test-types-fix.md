# Test File TypeScript Fixes (2026-01-18)

**Problem**: Multiple test files had TypeScript errors causing typecheck failures:
- useCollectionDragAndDrop.test.ts - useState mock type mismatch
- useDuplicate.test.ts - Missing type annotations causing `never` type inference
- useNodeFocus.test.ts - Incorrect type casting of Zustand store mock
- useNumberInput.test.ts - Wrong import path and missing required properties
- checkHfCache.test.ts - Missing type import
- ConnectableNodesStore.test.ts - Wrong property names for NodeMetadata/TypeMetadata
- NodeMenuStore.test.ts - Wrong property names (category vs title, type vs node_type)
- graphNodeToReactFlowNode.test.ts - createMockWorkflow didn't accept override parameters

**Solution**: Fixed each file individually:
1. Added proper type annotations and `as any` casts for mock implementations
2. Updated property names to match actual API types (node_type, title, basic_fields, etc.)
3. Fixed import paths for NumberInput component
4. Added missing type imports (HfCacheCheckResponse)
5. Made createMockWorkflow accept optional overrides parameter

**Files**:
- web/src/hooks/__tests__/useCollectionDragAndDrop.test.ts
- web/src/hooks/__tests__/useDuplicate.test.ts
- web/src/hooks/__tests__/useNodeFocus.test.ts
- web/src/hooks/__tests__/useNumberInput.test.ts
- web/src/serverState/__tests__/checkHfCache.test.ts
- web/src/stores/__tests__/ConnectableNodesStore.test.ts
- web/src/stores/__tests__/NodeMenuStore.test.ts
- web/src/stores/__tests__/graphNodeToReactFlowNode.test.ts

**Result**: All quality checks pass (typecheck, lint, tests)
