# SelectionActionToolbar Lint Warnings

**Problem**: Two lint warnings in SelectionActionToolbar.tsx:
1. Unused import 'Info' from @mui/icons-material
2. Unnecessary useMemo dependency 'selectedNodes.length'

**Solution**: 
- Removed unused 'Info' import
- Removed 'selectedNodes.length' from useMemo dependencies since 'canGroup' already depends on it

**Files**: web/src/components/node_editor/SelectionActionToolbar.tsx

**Date**: 2026-01-13
