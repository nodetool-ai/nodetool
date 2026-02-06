# Double Scrollbar in Workflow List

**Problem**: Extra scrollbar appearing in the workflow list due to nested scrollable containers.

**Solution**: Remove `overflow: "auto"` from parent `.workflow-items` container since the child `FixedSizeList` component handles scrolling internally.

**Date**: 2026-01-16

**Affected File**: `web/src/components/workflows/WorkflowList.tsx`
