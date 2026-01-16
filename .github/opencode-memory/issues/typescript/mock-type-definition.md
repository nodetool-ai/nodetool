# Mock Type Definition Fix

**Problem**: `useAutosave.test.ts` had incomplete mock for `getWorkflow` function, missing required Workflow type properties (`access`, `created_at`, `updated_at`, `description`, `graph`).

**Solution**: Added all required properties to the mock object.

**Files**:
- `web/src/hooks/__tests__/useAutosave.test.ts`

**Date**: 2026-01-16
