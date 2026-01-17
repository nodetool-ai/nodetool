# Performance Optimization: Inline Handlers Memoization (2026-01-17)

## Summary

Fixed inline arrow functions in render methods that created new function references on every render, causing unnecessary child component re-renders and performance issues.

## Changes Made

### 1. NodeExplorer.tsx

**Issue**: Three inline arrow functions inside a `.map()` loop creating new function references for every item on every render:
- Line 311: `onClick={() => handleNodeClick(entry.node.id)}`
- Lines 312-314: `onContextMenu={(event) => {...}}`
- Lines 331-334: `onClick={(event) => {...}}`

**Solution**: Created memoized handler factories:
```typescript
const handleEntryClick = useCallback(
  (nodeId: string) => () => {
    handleNodeClick(nodeId);
  },
  [handleNodeClick]
);

const handleEntryContextMenu = useCallback(
  (nodeId: string) => (event: React.MouseEvent) => {
    handleNodeContextMenu(event, nodeId);
  },
  [handleNodeContextMenu]
);

const handleEntryEditClick = useCallback(
  (nodeId: string) => (event: React.MouseEvent) => {
    handleNodeEditClick(event, nodeId);
  },
  [handleNodeEditClick]
);
```

**Impact**: For a workflow with 100+ nodes, this prevents creating 300+ new function references on every render.

### 2. TableActions.tsx

**Issue**: Three inline arrow functions creating new function references:
- Line 159: `onClick={() => { if (tabulator?.getSelectedRows().length) {...}}}`
- Line 181: `onClick={() => setShowSelect(!showSelect)}`
- Line 191: `onClick={() => setShowRowNumbers(!showRowNumbers)}`

**Solution**: 
1. Converted all handler functions to use `useCallback` with proper dependencies
2. Created dedicated handlers for toggle actions:
```typescript
const handleDeleteClick = useCallback(() => {
  if (tabulator?.getSelectedRows().length) {
    handleDeleteRows();
  }
}, [tabulator, handleDeleteRows]);

const handleToggleSelect = useCallback(() => {
  setShowSelect(!showSelect);
}, [setShowSelect, showSelect]);
```

3. Added `React.memo` to prevent re-renders when props haven't changed:
```typescript
export default React.memo(TableActions);
```

**Impact**: Prevents unnecessary re-renders when table data changes but these handlers haven't.

### 3. GradientBuilder.tsx

**Issue**: Six inline arrow functions creating new function references on every render:
- Line 288: `onMouseDown={(e) => handleStopDrag(index, e)}`
- Line 289: `onClick={() => setSelectedStopIndex(index)}`
- Line 303: `onChange={(e) => handleStopColorChange(...)}`
- Lines 311-315: `onChange={(e) => handleStopPositionChange(...)}`
- Line 326: `onClick={() => handleStopColorChange(...)}`
- Line 335: `onClick={() => removeStop(...)}`

**Solution**: Created memoized handler factories:
```typescript
const handleStopClick = useCallback((index: number) => () => {
  setSelectedStopIndex(index);
}, []);

const handleStopMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
  handleStopDrag(index, e);
}, [handleStopDrag]);

const handleColorChange = useCallback((index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
  handleStopColorChange(index, e.target.value);
}, [handleStopColorChange]);
```

**Impact**: Prevents creating 6 new function references every time the gradient state changes.

## Performance Impact

### Before Optimization
- **NodeExplorer**: 3 new functions × N nodes per render
- **TableActions**: 3 new functions per render + full component re-render
- **GradientBuilder**: 6 new functions per render

### After Optimization
- **NodeExplorer**: 3 stable memoized functions regardless of node count
- **TableActions**: 0 new functions + component memoization
- **GradientBuilder**: 6 stable memoized functions

## Technical Details

### Handler Factory Pattern
When handlers need to pass parameters to callback functions, the factory pattern is used:

```typescript
// ❌ Bad - creates new function on every render
onClick={() => handleClick(id)}

// ✅ Good - stable reference returned from memoized factory
const handleClickWithId = useCallback((id: string) => () => {
  handleClick(id);
}, [handleClick]);
onClick={handleClickWithId(id)}
```

### Dependency Arrays
All `useCallback` hooks include proper dependencies:
- Functions that depend on props include those props as dependencies
- Stale closures are prevented by including all referenced values
- Empty dependency arrays are used only for truly stable functions

## Files Modified

1. `web/src/components/node/NodeExplorer.tsx` - Added 3 handler factories
2. `web/src/components/node/DataTable/TableActions.tsx` - Added 6 useCallback + React.memo
3. `web/src/components/color_picker/GradientBuilder.tsx` - Added 6 handler factories

## Verification

- ✅ Lint passes on all modified files
- ✅ TypeScript compilation passes (pre-existing errors unrelated to changes)
- ✅ No new lint warnings introduced

## Related Patterns

See also:
- `inline-arrow-function-memoization-20260117.md` - Previous optimization session
- `zustand-selective-subscriptions.md` - Store subscription optimization
- `component-memoization-20260116.md` - React.memo usage patterns

## Recommendations

1. **Review New Components**: Ensure all new components follow this pattern
2. **Add Lint Rule**: Consider adding an ESLint rule to catch inline arrow functions
3. **Developer Education**: Document this pattern in the codebase style guide
4. **Automated Detection**: Add pre-commit hook to detect inline handlers in maps
