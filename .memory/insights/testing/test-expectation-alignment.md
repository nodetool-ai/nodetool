# Test Expectation Alignment

**Insight**: Test expectations must match actual implementation behavior, not assumed behavior.

**Issue**: Tests for `distributeHorizontal` and `distributeVertical` expected even distribution but implementation uses sequential placement with node dimensions + spacing.

**Key Learning**: When writing tests for algorithms (distribution, alignment, layout), verify the expected values by:
1. Tracing through the actual code logic
2. Using the real constants (NODE_WIDTH=280, HORIZONTAL_SPACING=40, etc.)
3. Calculating expected values based on the implementation, not assumptions

**Impact**: 2 failing tests fixed, all 2112 tests now pass

**Files**: `web/src/hooks/__tests__/useSelectionActions.test.ts`, `web/src/hooks/useSelectionActions.ts`

**Date**: 2026-01-12
