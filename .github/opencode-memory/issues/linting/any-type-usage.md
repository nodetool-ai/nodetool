# `any` Type Usage

**Problem**: ESLint error `@typescript-eslint/no-explicit-any`.

**Solution**: Use explicit types:
```typescript
// ❌ Bad
function process(data: any) { }

// ✅ Good
interface Data {
  id: string;
  value: number;
}
function process(data: Data) { }

// Or for truly unknown data:
function process(data: unknown) {
  if (typeof data === 'object' && data !== null) {
    // Type guard
  }
}
```

**Date**: 2026-01-10
