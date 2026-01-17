# useWorkflowActions Test Mock Fixes

**Problem**: Tests in `useWorkflowActions.test.ts` were failing with:
1. "Invalid hook call" errors when trying to mock `useNavigate`
2. Tests expecting wrong mock functions to be called
3. Unused variables causing lint warnings

**Solution**: 
- Fixed `react-router-dom` mock setup by properly mocking at module level
- Corrected mock variable references from `mockCreateNew`/`mockCreate` to `mockCreateNewWorkflow`/`mockCreateWorkflow`
- Removed unused variables to eliminate lint warnings

**Files**: `web/src/hooks/__tests__/useWorkflowActions.test.ts`

**Date**: 2026-01-17
