# Performance Optimization: PaneContextMenu useCallback Fix (2026-01-22)

## Issue

The `PaneContextMenu.tsx` component had a lint warning about the `addComment` function:

```
The 'addComment' function makes the dependencies of useCallback Hook (at line 262) change on every render.
```

The `addComment` function was defined as a regular function but used inside a `useCallback` hook (`handleAddCommentAndClose`), causing the dependencies array to change on every render.

## Solution

Wrapped `addComment` in `useCallback` with proper dependencies:

```typescript
const addComment = useCallback(
  (event: React.MouseEvent) => {
    const metadata = COMMENT_NODE_METADATA;
    const newNode = createNode(
      metadata,
      reactFlowInstance.screenToFlowPosition({
        x: menuPosition?.x || event.clientX,
        y: menuPosition?.y || event.clientY
      })
    );
    newNode.width = 150;
    newNode.height = 100;
    newNode.style = { width: 150, height: 100 };
    addNode(newNode);
  },
  [createNode, addNode, reactFlowInstance, menuPosition]
);
```

## Files Modified

- `web/src/components/context_menus/PaneContextMenu.tsx`

## Impact

- Fixed lint warning about exhaustive-deps
- Stable function references for context menu operations
- Improved render performance when opening context menus

## Verification

- ESLint: Pass (warning resolved)
