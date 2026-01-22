# Code Quality Fixes (2026-01-22)

**Problem**: Multiple TypeScript errors and linting issues across the codebase affecting web package.

**Solution**: Fixed 5 TypeScript errors and 11 linting issues in web package.

**TypeScript Fixes**:
- `DataTable.tsx`: Fixed type mismatch with `getHistoryUndoSize()`/`getHistoryRedoSize()` returning `number | boolean`
- `DataTable.tsx`: Fixed `clearFilter()` call by adding type assertion for correct signature
- `DataframeProperty.tsx`: Fixed `property.description` null handling with nullish coalescing
- `WorkflowManagerStore.ts`: Replaced non-existent `loadNodesAndEdges()` with proper `setNodes()`/`setEdges()` pattern

**Lint Fixes**:
- `MessageInput.tsx`: Added braces to if statement
- `TableActions.tsx`: Added braces to if statements, changed `let` to `const` for `columnMapping`, prefixed unused `_handleExportJSON`
- `TableActions.tsx`: Changed unused `error` to `_error` in catch clause
- `OutputRenderer.tsx`: Removed unused `DataTable` import
- `VersionHistoryPanel.tsx`: Removed unused `isDeletingVersion` from destructuring
- `WorkflowManagerStore.ts`: Added braces to if statement

**Files**:
- web/src/components/node/DataTable/DataTable.tsx
- web/src/components/properties/DataframeProperty.tsx
- web/src/stores/WorkflowManagerStore.ts
- web/src/components/chat/composer/MessageInput.tsx
- web/src/components/node/DataTable/TableActions.tsx
- web/src/components/node/OutputRenderer.tsx
- web/src/components/version/VersionHistoryPanel.tsx

**Date**: 2026-01-22
