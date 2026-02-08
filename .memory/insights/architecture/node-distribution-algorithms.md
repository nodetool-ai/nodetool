# Node Distribution Algorithms

**Insight**: There are multiple valid approaches to distributing nodes in a visual editor:

1. **Fixed Spacing**: Place nodes with constant distance between them (e.g., 40px)
   - Pros: Predictable, consistent gaps
   - Cons: May not fill available space

2. **Equal Distribution**: Spread nodes evenly across the total span
   - Formula: `position = min + index * (max - min) / (count - 1)`
   - Pros: Fills available space, visually balanced
   - Cons: Spacing varies based on total span

**Decision**: The Selection Action Toolbar uses Equal Distribution to maximize space utilization and create visually balanced layouts.

**Files**: `web/src/hooks/useSelectionActions.ts`

**Date**: 2026-01-12
