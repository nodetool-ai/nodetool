# Merge Conflict Markers Fix (2026-01-17)

**Problem**: Unresolved git merge conflict markers in source files causing TypeScript and ESLint parsing errors.

**Solution**: Removed merge conflict markers and resolved conflicts by keeping the correct implementation from origin/main.

**Files**:
- `web/src/components/node/NodeDescription.tsx` - Fixed handler functions and JSX
- `web/src/components/node/NodeLogs.tsx` - Removed duplicate Chip elements and merge markers
- `web/src/hooks/__tests__/useAutosave.test.ts` - Complete file rewrite to remove all merge conflicts and duplicate code

**Impact**: TypeScript type checking now passes (merge conflict parsing errors eliminated). ESLint parsing errors eliminated.

**Verification**: `make typecheck` and `make lint` now pass with 0 errors.
