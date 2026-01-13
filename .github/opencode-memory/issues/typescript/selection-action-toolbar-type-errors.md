# SelectionActionToolbar Type Errors

**Problem**: Test file was passing non-existent `onToggleNodeInfo` prop to SelectionActionToolbar component, causing TypeScript errors.

**Solution**: Removed the invalid `onToggleNodeInfo` prop from test cases.

**Files**:
- `web/src/components/node_editor/__tests__/SelectionActionToolbar.test.tsx`

**Date**: 2026-01-13
