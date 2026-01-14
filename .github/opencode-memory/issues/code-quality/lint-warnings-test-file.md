# Lint Warnings in Test File

**Problem**: `NodeExecutionTime.test.tsx` had lint warnings for unused variable and missing curly braces.

**Solution**: Removed unused `formatDuration` function that was assigned but never used in the "should not render when status is running" test.

**Files**: `web/src/components/node/__tests__/NodeExecutionTime.test.tsx`

**Date**: 2026-01-14
