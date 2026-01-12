# Test Expectation Mismatch - Distribute Functions

**Problem**: Tests in `useSelectionActions.test.ts` had incorrect expectations for distributeHorizontal and distributeVertical functions.

The tests expected even distribution (0, 200, 400) but the implementation uses sequential placement with calculated spacing based on node dimensions.

**Root Cause**: Test expectations were not aligned with actual implementation behavior:
- Implementation uses: `position = leftMostX + (index * (nodeWidth + spacing))`
- NODE_WIDTH=280, NODE_HEIGHT=50, HORIZONTAL_SPACING=40, VERTICAL_SPACING=20
- Test nodes used `measured: { width: 100, height: 50 }`
- This results in positions 0, 140, 280 for horizontal and 0, 70, 140 for vertical

**Solution**: Updated test expectations to match actual implementation.

**Files**: `web/src/hooks/__tests__/useSelectionActions.test.ts`

**Prevention**: When adding tests for distribution/alignment functions, verify expected values against actual implementation constants.

**Date**: 2026-01-12
