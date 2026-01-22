# Quality Check Fixes (2026-01-22)

**Problem**: useAutosave.test.ts failing with "No QueryClient set" error because the hook uses useQueryClient from React Query.

**Solution**: Added mock for @tanstack/react-query module to provide a mock QueryClient for the test.

**Files**:
- web/src/hooks/__tests__/useAutosave.test.ts

**Date**: 2026-01-22
