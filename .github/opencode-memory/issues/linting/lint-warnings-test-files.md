# Lint Warnings in Test Files

**Problem**: 10 lint warnings in test files about unused variables, imports, and error variables.

**Solution**: 
- Removed unused imports (`act`, `NamespaceTree`, `Workflow`, `NodeMetadata`, `TypeMetadata`)
- Removed unused variables (`selectedNodes`, `createMockNodeMetadata`, `createMockTypeMetadata`)
- Prefixed unused error variables with underscore (`_e`)

**Files**:
- web/src/hooks/__tests__/useDuplicate.test.ts
- web/src/hooks/__tests__/useNamespaceTree.test.ts
- web/src/hooks/__tests__/useNumberInput.test.ts
- web/src/stores/__tests__/ConnectableNodesStore.test.ts
- web/src/stores/__tests__/WorkflowActionsStore.test.ts
- web/src/utils/__tests__/downloadPreviewAssets.test.ts

**Date**: 2026-01-18
