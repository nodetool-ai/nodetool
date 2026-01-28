### `any` Type Usage Throughout Codebase (2026-01-11)

**Issue**: Found 100+ instances of implicit `any` types and explicit `any` usage throughout the codebase.

**Categories**:
1. **Test Files**: Many test files use `any` for mock data and selectors - acceptable for tests
2. **Error Handling**: `catch (error: any)` pattern used throughout - could use `unknown` with type guards
3. **Utility Functions**: Some utility functions use `any` for flexible input types
4. **Component Props**: Some component props use `any` instead of specific types

**Recommendation**: Focus on fixing `any` types in:
1. Critical error handling paths
2. Component props passed frequently
3. Data transformation utilities

**Not Fixed**: Due to scope, but identified for future improvement.
