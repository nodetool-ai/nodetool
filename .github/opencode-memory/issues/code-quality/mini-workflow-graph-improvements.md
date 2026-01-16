# MiniWorkflowGraph Type and Style Improvements

**Problem**: Component had:
1. Multiple `any` types reducing type safety
2. Hardcoded Material-UI color values instead of theme-based CSS variables

**Solution**:
1. Added `GraphNode` and `GraphEdge` interfaces with proper typing
2. Replaced `any` types with typed interfaces in filter and map callbacks
3. Replaced hardcoded hex colors (`#4caf50`, `#f44336`, `#ff9800`) with CSS custom properties:
   - `var(--palette-success-main, #4caf50)`
   - `var(--palette-error-main, #f44336)`
   - `var(--palette-warning-main, #ff9800)`

**Files**: 
- `web/src/components/miniapps/components/MiniWorkflowGraph.tsx`

**Date**: 2026-01-15
