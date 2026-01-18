# Test TypeScript Type Fixes (2026-01-18)

**Problem**: Multiple test files had TypeScript errors including incorrect mock types, missing type imports, and property name mismatches with API schema types.

**Solution**: Fixed type definitions in test mocks to match actual API schema types:
- Changed `type` to `node_type` in NodeMetadata mocks
- Changed `name` to `title` in NodeMetadata mocks  
- Removed `category` property (doesn't exist in NodeMetadata)
- Fixed SearchResultGroup to use `title` instead of `category`
- Fixed InputProps mock to not use non-existent `step` property
- Fixed NumberInputState mock with all required properties
- Fixed useNodeFocus store mock with proper typing for focusedNodeId
- Added proper type import for HfCacheCheckResponse
- Removed unused mock functions in ConnectableNodesStore.test.ts

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
