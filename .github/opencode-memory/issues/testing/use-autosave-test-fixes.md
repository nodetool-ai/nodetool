# UseAutosave Test Fixes

**Problem**: Tests were providing empty workflow graphs (`graph: { nodes: [], edges: [] }`) which caused the hook's `isWorkflowEmpty()` check to return early, preventing fetch calls.

**Solution**: Updated test mock to provide a non-empty workflow graph with at least one node: `graph: { nodes: [{ id: "node-1", type: "test", sync_mode: "start" }], edges: [] }`

**Files**:
- web/src/hooks/__tests__/useAutosave.test.ts

**Date**: 2026-01-19
