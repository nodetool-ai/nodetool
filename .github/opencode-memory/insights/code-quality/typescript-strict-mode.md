# TypeScript Strict Mode

**Insight**: Strict mode catches bugs early but requires discipline with types.

**Key Rules**:
- `strictNullChecks`: Catch null/undefined errors
- `noImplicitAny`: Force explicit types
- `strictFunctionTypes`: Catch callback type errors

**Common Patterns**:
```typescript
// Optional chaining for null safety
const value = object?.property?.nested;

// Nullish coalescing for defaults
const name = user.name ?? 'Anonymous';

// Type guards for narrowing
if (typeof value === 'string') {
  value.toUpperCase(); // TypeScript knows it's string
}
```

**Date**: 2026-01-10
