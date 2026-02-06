# ESLint Strict Equality

**Insight**: Always use `===` instead of `==` to avoid type coercion bugs.

**Why**: 
- `==` performs type coercion (e.g., `"0" == 0` is true)
- Type coercion is unpredictable and causes bugs
- Exception: `value == null` checks both null and undefined

**Rule**: `eqeqeq` ESLint rule enforces this.

**Date**: 2026-01-10
