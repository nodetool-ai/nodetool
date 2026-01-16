# Utility Function Testing Patterns

**Insight**: Test utility functions by covering all input branches and edge cases, using simple function calls without complex React testing infrastructure.

**Why**: Utility functions are pure logic that can be tested directly without the overhead of React components or hooks.

**Patterns Used**:

1. **Mock Data Factories**: Create helper functions to generate consistent mock data with optional overrides.
   ```typescript
   const createMockModel = (overrides: Partial<UnifiedModel> = {}): UnifiedModel => ({
     id: "model-1",
     name: "Test Model",
     type: null,
     repo_id: null,
     path: null,
     allow_patterns: null,
     ignore_patterns: null,
     ...overrides
   });
   ```

2. **Describe Blocks for Logical Grouping**: Group tests by behavior or input type.
   ```typescript
   describe("functionName", () => {
     describe("input type A", () => { /* tests */ });
     describe("input type B", () => { /* tests */ });
     describe("edge cases", () => { /* tests */ });
   });
   ```

3. **Type-Safe Mocks**: Use TypeScript's `Partial<T>` and proper type annotations to ensure tests compile correctly with generated types.

4. **Avoid URL/DOM Mocks When Possible**: For utility functions that use `URL.createObjectURL`, test the string handling logic separately and skip blob URL tests that require complex DOM mocking.

5. **Test Edge Cases First**: Empty strings, null, undefined, zero, false - all falsy values should be tested explicitly.

**Files Created**:
- `src/utils/__tests__/edgeValue.test.ts` - Tests for `resolveExternalEdgeValue` function
- `src/utils/__tests__/hfCache.test.ts` - Tests for HuggingFace cache utilities
- `src/utils/__tests__/imageUtils.test.ts` - Tests for image URL creation
- `src/utils/__tests__/downloadPreviewAssets.test.ts` - Tests for download payload logic

**Coverage Added**: 75 new tests covering edgeValue, hfCache, imageUtils, and downloadPreviewAssets utilities.

**Date**: 2026-01-16
