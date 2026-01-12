# Strict Equality

**Problem**: ESLint error `eqeqeq` for using `==` instead of `===`.

**Solution**: Use strict equality:
```typescript
// ❌ Bad
if (value == null) { }

// ✅ Good
if (value === null) { }

// Exception: checking both null and undefined
if (value == null) { } // OK, intentional loose equality
```

**Date**: 2026-01-10
