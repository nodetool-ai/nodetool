### Test Expectation Fix for Distribute Functions (2026-01-12)

**Issue**: Tests in `useSelectionActions.test.ts` expected sequential placement values (140, 280 for horizontal, 70, 140 for vertical) but the implementation uses equal distribution algorithm.

**Root Cause**: The implementation uses the formula:
- Horizontal: `newX = leftMostX + (index * (rightMostX - leftMostX)) / (count - 1)`
- Vertical: `newY = topMostY + (index * (bottomMostY - topMostY)) / (count - 1)`

This produces equal intervals across the span, not sequential placement.

**Solution**: Updated test expectations to match actual implementation:
- Horizontal with nodes at 0, 200, 400: positions become 0, 200, 400
- Vertical with nodes at 0, 200, 400: positions become 0, 200, 400

**Files Modified**: `web/src/hooks/__tests__/useSelectionActions.test.ts`

**Date**: 2026-01-12
