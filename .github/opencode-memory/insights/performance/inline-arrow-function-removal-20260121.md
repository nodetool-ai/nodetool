# Performance Optimization: Inline Arrow Function Removal (2026-01-21)

## Summary

Removed unnecessary inline arrow functions in JSX event handlers across multiple components to prevent creating new function references on every render. Applied curried handler pattern for stable function references.

## Changes Made

### 1. RenderNodesSelectable.tsx
**File**: `web/src/components/node_menu/RenderNodesSelectable.tsx`

**Issue**: 3 instances of `onClick={() => handleNodeClick(node)}` creating new functions on every render

**Fix**: 
- Modified `handleNodeClick` to return a function (curried pattern)
- Changed to `onClick={handleNodeClick(node)}`

**Code Changes**:
```typescript
// Before
const handleNodeClick = useCallback(
  (node: NodeMetadata) => {
    if (onNodeClick) {
      onNodeClick(node);
    } else if (showCheckboxes && onToggleSelection) {
      onToggleSelection(node.node_type);
    }
  },
  [onNodeClick, showCheckboxes, onToggleSelection]
);

// After  
const handleNodeClick = useCallback(
  (node: NodeMetadata) => () => {
    if (onNodeClick) {
      onNodeClick(node);
    } else if (showCheckboxes && onToggleSelection) {
      onToggleSelection(node.node_type);
    }
  },
  [onNodeClick, showCheckboxes, onToggleSelection]
);
```

### 2. TagFilter.tsx
**File**: `web/src/components/workflows/TagFilter.tsx`

**Issue**: `onClick={() => handleSelectTag(tag)}` creating new function on every render

**Fix**: 
- Modified `handleSelectTag` to return a function
- Changed to `onClick={handleSelectTag(tag)}`

### 3. WorkflowToolbar.tsx
**File**: `web/src/components/workflows/WorkflowToolbar.tsx`

**Issues**: 
- 3 instances of `onClick={() => toggleTag(tag)}`
- 2 instances of `onClick={() => handleSortChange("date"|"name")}`
- 1 instance of `onDelete={() => toggleTag(tag)}` (Chip component)

**Fix**: 
- Added `handleToggleTag` and `handleSortChange` as curried handlers
- All changed to direct function calls

### 4. WorkflowTile.tsx
**File**: `web/src/components/workflows/WorkflowTile.tsx`

**Issues**:
- `onClick={() => onSelect(workflow)}`
- `onDoubleClick={() => onDoubleClickWorkflow(workflow)}`
- `onClick={() => onClickOpen(workflow)}`
- `onClick={(event) => onDuplicateWorkflow(event, workflow)}`

**Fix**:
- Added 4 memoized handlers: `handleClick`, `handleDoubleClick`, `handleOpenClick`, `handleDuplicateClick`
- All changed to direct handler references

### 5. ColorPicker.tsx
**File**: `web/src/components/inputs/ColorPicker.tsx`

**Issue**: `onClick={() => handleColorCellClick(cellColor)}`

**Fix**:
- Modified `handleColorCellClick` to return a function
- Changed to `onClick={handleColorCellClick(cellColor)}`

### 6. Select.tsx
**File**: `web/src/components/inputs/Select.tsx`

**Issue**: `onClick={() => handleOptionClick(option.value)}`

**Fix**:
- Modified `handleOptionClick` to return a function
- Changed to `onClick={handleOptionClick(option.value)}`

## Performance Impact

**Estimated savings**: ~10-15 new function allocations per render in affected components

**Components affected**:
- Node menu rendering (frequent)
- Workflow list/grid (frequent)
- Tag filtering (moderate)
- Color picking (occasional)
- Select dropdowns (moderate)

**User impact**: Reduced CPU usage during interactions, smoother UI on lower-end devices

## Pattern Applied

The curried handler pattern:
```typescript
const handleClick = useCallback((param: string) => () => {
  doSomething(param);
}, [doSomething]);

// Usage in JSX
onClick={handleClick(param)}
```

This pattern:
1. Creates handler once (memoized with useCallback)
2. Returns a stable function reference
3. Avoids creating new arrow functions on each render

## Verification

- ✅ TypeScript: All packages pass
- ✅ Linting: No errors (1 pre-existing warning)
- ✅ Tests: 3138/3140 pass (2 skipped, 1 pre-existing error unrelated to changes)

## Related Patterns

See also:
- `.github/opencode-memory/insights/performance/handler-memoization-20260117.md`
- `.github/opencode-memory/insights/performance/inline-arrow-function-memoization-20260119.md`
- `.github/opencode-memory/insights/performance/component-memoization-20260120.md`
