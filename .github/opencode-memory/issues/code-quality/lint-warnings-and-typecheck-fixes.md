# Lint Warnings and Mobile TypeCheck Fixes

**Problem**: Multiple code quality issues were found:
- 10 unused variable warnings in test files
- Mobile package type checking failing due to missing type definitions

**Solution**: Fixed all issues:
- Removed unused imports and variables in test files
- Ran npm install to ensure type definitions were properly installed
- Renamed unused catch error variables to `_e` per ESLint convention

**Files**:
- web/src/hooks/__tests__/useDuplicate.test.ts
- web/src/hooks/__tests__/useNamespaceTree.test.ts
- web/src/hooks/__tests__/useNumberInput.test.ts
- web/src/stores/__tests__/ConnectableNodesStore.test.ts
- web/src/stores/__tests__/WorkflowActionsStore.test.ts
- web/src/utils/__tests__/downloadPreviewAssets.test.ts
- mobile/package.json
- mobile/package-lock.json

**Date**: 2026-01-18

**Verification**:
- make typecheck: ✅ Pass (all packages)
- make lint: ✅ Pass (zero warnings)
- make test: ✅ Pass (595 tests)
