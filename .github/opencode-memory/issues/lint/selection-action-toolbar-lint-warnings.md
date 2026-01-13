# SelectionActionToolbar Lint Warnings

**Problem**: Component had lint warnings for unused import and unnecessary useMemo dependency.

**Solution**:
- Removed unused `Info` import from MUI icons
- Removed unnecessary `selectedNodes.length` dependency from useMemo array

**Files**:
- `web/src/components/node_editor/SelectionActionToolbar.tsx`

**Date**: 2026-01-13
