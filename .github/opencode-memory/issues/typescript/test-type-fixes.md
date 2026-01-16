# Test Type Fixes

**Problem**: Multiple test files had TypeScript errors and lint issues:
- `ResultsStore.ts`: Missing `chunk` parameter in `setProgress` type definition
- `ResultsStore.test.ts`: Missing required properties (`type`, `status`, `phase`) in mock objects
- `NodeFocusStore.test.ts`: Missing `dynamic_properties` in NodeData mock
- `useAutosave.test.ts`: Missing required Workflow properties in mock
- ESLint errors for `require()` imports in test files

**Solution**:
1. Added missing `chunk?: string` parameter to `ResultsStore.setProgress` type definition
2. Added missing `getProgress` return type with chunk property
3. Fixed `mockTask` to include `type`, `title`, and `steps` fields
4. Fixed `mockToolCall` to include `type: "tool_call_update"`
5. Fixed `mockPlanningUpdate` to use `phase`, `status`, `content` instead of `planning`
6. Added missing `dynamic_properties` to NodeData mock in NodeFocusStore.test.ts
7. Added required Workflow properties (`access`, `created_at`, `updated_at`, `description`, `graph`) to mock
8. Added ESLint rule override to allow `require()` in test files

**Files**:
- `web/src/stores/ResultsStore.ts`
- `web/src/stores/__tests__/ResultsStore.test.ts`
- `web/src/stores/__tests__/NodeFocusStore.test.ts`
- `web/src/hooks/__tests__/useAutosave.test.ts`
- `web/eslint.config.mjs`

**Date**: 2026-01-17
