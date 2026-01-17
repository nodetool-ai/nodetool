# ESLint require() Imports Fix (2026-01-17)

**Problem**: Test files using `require()` instead of ES6 imports violated ESLint rule `@typescript-eslint/no-require-imports`.

**Solution**: Replaced `require()` calls with ES6 imports for mocked modules in test files.

**Files**:
- `web/src/hooks/__tests__/useAlignNodes.test.ts` - Added imports for `@xyflow/react` and `@xyflow/react`, replaced 8 require() calls
- `web/src/hooks/__tests__/useFitView.test.ts` - Added imports, replaced 6 require() calls
- `web/src/hooks/__tests__/useFocusPan.test.ts` - Added imports, replaced 7 require() calls

**Pattern Used**:
```typescript
// Before (ESLint error)
(require("@xyflow/react").useReactFlow as jest.Mock).mockReturnValue(...)

// After (ESLint compliant)
import * as xyflowReact from "@xyflow/react";
(xyflowReact.useReactFlow as jest.Mock).mockReturnValue(...)
```

**Impact**: ESLint now passes with 0 errors (only warnings remain).

**Verification**: `make lint` shows 0 errors, 5 warnings only.
