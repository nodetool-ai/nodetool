# Dead Code Removal

**Problem**: Commented-out dead code was cluttering the codebase, making it harder to read and maintain.

**Solution**: Removed two blocks of commented-out code:
1. `web/src/utils/TypeHandler.ts`: Removed commented-out `isConnectableToUnion` function and its JSDoc comment
2. `web/src/stores/NodeStore.ts`: Removed commented-out model caching code block

**Files**: 
- `web/src/utils/TypeHandler.ts`
- `web/src/stores/NodeStore.ts`

**Date**: 2026-01-13
