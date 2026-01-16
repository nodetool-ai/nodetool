### Performance Optimization: Inline Arrow Functions and Component Memoization (2026-01-16)

**Issue**: Multiple node components had inline arrow functions in render methods and were missing React.memo, causing unnecessary re-renders when parent components updated.

**Measurement**: Components re-rendering on every parent update, with new function references created on each render.

**Solution**: 
1. Added React.memo to component exports to prevent re-renders when props don't change
2. Memoized inline arrow functions with useCallback where appropriate

**Files Optimized**:
- `web/src/components/node/NodeColorSelector.tsx` - Added React.memo, memoized handleColorButtonClick
- `web/src/components/node/NodeLogs.tsx` - Memoized handleClose callback
- `web/src/components/node/NodeDescription.tsx` - Added React.memo
- `web/src/components/node/PropertyInput.tsx` - Memoized handleNameChange callback
- `web/src/components/node/image_editor/ImageEditorToolbar.tsx` - Added React.memo, memoized all tool selection and action callbacks

**Impact**: Reduced unnecessary re-renders in frequently-used node editor components by ensuring components only update when their specific props change. Inline callbacks are now stable references.

**Pattern**:
```typescript
// Before - no memoization
export const MyComponent: React.FC = () => {
  return <Button onClick={() => handleAction(id)}>Click</Button>;
};

// After - memoized
export const MyComponent: React.FC = () => {
  const handleClick = useCallback(() => handleAction(id), [id]);
  return <Button onClick={handleClick}>Click</Button>;
};
export default React.memo(MyComponent);
```

---

### Performance Optimization: Store Subscriptions (2026-01-16)

**Issue**: Components were subscribing to entire Zustand stores without selectors, causing unnecessary re-renders when any state in the store changed.

**Measurement**: Components re-rendering on every store update, even when only unrelated state changed.

**Solution**: Converted full store subscriptions to selective state slices using Zustand selectors.

**Files Optimized**:
- `web/src/components/workspaces/WorkspaceTree.tsx` - Fixed useWorkspaceManagerStore subscription
- `web/src/components/menus/FoldersSettingsMenu.tsx` - Fixed useNotificationStore subscription
- `web/src/components/node_menu/NamespaceItem.tsx` - Fixed useNodeMenuStore subscription

**Impact**: Components now only re-render when their specific selected state changes, reducing unnecessary renders in workspace and menu components.

**Pattern**:
```typescript
// Before - subscribes to entire store
const { setIsOpen } = useWorkspaceManagerStore();

// After - selective subscription
const setIsOpen = useWorkspaceManagerStore(state => state.setIsOpen);
```
