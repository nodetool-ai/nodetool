# Default vs Named Export Fix

**Problem**: `useAlignNodes.test.ts` was using named import `{ useAlignNodes }` but the source file exports it as default export.

**Solution**: Changed import to use default import: `import useAlignNodes from "../useAlignNodes"`.

**Files**:
- `web/src/hooks/__tests__/useAlignNodes.test.ts`

**Date**: 2026-01-16
