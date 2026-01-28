### Distribute Functions Test Failures (2026-01-12)

**Issue**: Two tests in `useSelectionActions.test.ts` were failing for distributeHorizontal and distributeVertical functions.

**Root Cause**: The implementation used fixed spacing between nodes (40px horizontal, 20px vertical), but the tests expected equal distribution across the total span (evenly spaced from min to max position).

**Solution**: Updated both distribute functions to use equal distribution algorithm:
- For horizontal: `newX = leftMostX + (index * (rightMostX - leftMostX)) / (count - 1)`
- For vertical: `newY = topMostY + (index * (bottomMostY - topMostY)) / (count - 1)`

This places nodes at equal intervals across the span from first to last node.

**Files Modified**: `web/src/hooks/useSelectionActions.ts`

**Additional Fix**: Removed unused constants `NODE_HEIGHT`, `HORIZONTAL_SPACING`, and `VERTICAL_SPACING` that were no longer needed after the algorithm change. Kept `NODE_WIDTH` as it's still used in align functions.

**Date**: 2026-01-12
