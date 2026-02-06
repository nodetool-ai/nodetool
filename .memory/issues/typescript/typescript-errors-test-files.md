# TypeScript Type Errors in Test Files

**Problem**: TypeScript errors in test files due to missing required properties in `TypeMetadata` type and type inference issues in `renderHook`.

**Solution**: Added required `optional` and `type_args` properties to `TypeMetadata` objects in tests, and used `as any` cast to bypass type inference issues in `renderHook` rerender calls.

**Files**:
- web/src/hooks/nodes/__tests__/useDynamicOutput.test.ts
- web/src/hooks/nodes/__tests__/useDynamicProperty.test.ts

**Date**: 2026-01-18
