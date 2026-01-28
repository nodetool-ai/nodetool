# useRemoveFromGroup Test Mock Fixes

**Problem**: Tests in `useRemoveFromGroup.test.ts` were failing with "TypeError: useNodes.mockReturnValue is not a function" - the mock was not properly set up before destructuring from NodeContext.

**Solution**: Changed from destructuring and casting to using `jest.spyOn()` for proper mock setup before tests run.

**Files**: `web/src/hooks/nodes/__tests__/useRemoveFromGroup.test.ts`

**Date**: 2026-01-17
