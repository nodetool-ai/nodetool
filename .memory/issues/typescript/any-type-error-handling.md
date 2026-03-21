# TypeScript any Type Fixes in Error Handling

**Problem**: Multiple catch blocks in stores used `any` type for error variables, reducing type safety and making it harder to understand error handling patterns.

**Solution**: Replaced `any` types with `unknown` and implemented proper error type guards:

```typescript
// Before (❌ Bad)
} catch (err: any) {
  set({ error: err.message || "Failed to load secrets" });
  throw err;
}

// After (✅ Good)
} catch (err: unknown) {
  const error = err instanceof Error ? err : new Error(String(err));
  set({ error: error.message || "Failed to load secrets" });
  throw error;
}
```

Also updated `createErrorMessage` function to handle `unknown` type with proper type guards:

```typescript
export const createErrorMessage = (
  error: unknown,
  defaultMessage: string
): Error => {
  if (
    typeof error === "object" &&
    error !== null &&
    "detail" in error &&
    error.detail
  ) {
    return new AppError(defaultMessage, String(error.detail));
  }
  // ... rest of the function
};
```

**Files**:
- `web/src/stores/SecretsStore.ts`
- `web/src/stores/useAuth.ts`
- `web/src/stores/CollectionStore.ts`
- `web/src/utils/errorHandling.ts`

**Date**: 2026-01-12
