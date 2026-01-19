# Inline Arrow Function Memoization (2026-01-19)

## Issue

Inline arrow functions in JSX create new function references on every render, causing child components to re-render even when props haven't changed.

## Pattern Found

```typescript
// ❌ Before - creates new function on every render
onClick={() => handleNodeClick(entry.node.id)}

// ❌ Before - same issue
onClick={() => handleToolClick("select")}
```

## Solution Applied

### Option 1: Use .bind() for stable references

```typescript
// ✅ After - stable function reference
onClick={handleNodeClick.bind(null, entry.node.id)}
```

### Option 2: Memoize component with React.memo

```typescript
// ✅ Component only re-renders when props change
export default memo(NodeExplorer);
```

## Files Fixed

1. **web/src/components/node/NodeExplorer.tsx**
   - Added `memo` import from React
   - Wrapped component export with `memo(NodeExplorer)`
   - Component now only re-renders when props (nodes, entries, filter) change

2. **web/src/components/node/image_editor/ImageEditorToolbar.tsx**
   - Changed inline arrow functions to `.bind(null, toolName)` pattern
   - `onClick={() => handleToolClick("select")}` → `onClick={handleToolClick.bind(null, "select")}`
   - Applied to 4 tool buttons (select, crop, draw, erase)

## Impact

- Reduced unnecessary re-renders in NodeExplorer component
- Prevented new function references on every render for ImageEditorToolbar tools
- Child components (ListItemButton, IconButton) now receive stable function references

## Verification

- TypeScript compilation: Passes
- ESLint: Passes
- Component memoization prevents parent re-renders from causing child re-renders

## Related Patterns

See also:
- `component-memoization-20260117.md` - Component memoization strategies
- `inline-handler-memoization-20260116.md` - Handler memoization patterns
- `zustand-selective-subscriptions.md` - Zustand store subscription optimization
