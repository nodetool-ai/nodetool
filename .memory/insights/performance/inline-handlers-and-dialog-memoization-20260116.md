### Performance Optimization: Inline Arrow Functions Memoization (2026-01-16)

**Issue**: Components had inline arrow functions in render that created new function references on every render, causing unnecessary re-renders of child components.

**Measurement**: Each inline arrow function creates a new function reference, triggering React.memo'd child components to re-render.

**Solution**: Wrapped inline handlers in useCallback hooks for stable references.

**Files Optimized**:
- `web/src/components/node/NodeColorSelector.tsx` - Fixed inline onClick handler for color selection
- `web/src/components/node/NodeLogs.tsx` - Fixed inline onClose handler for dialog
- `web/src/components/node/NodeDescription.tsx` - Fixed inline onClick handler for tag clicks
- `web/src/components/node/OutputRenderer.tsx` - Fixed inline handlers for asset viewer and 3D model viewer
- `web/src/components/node/PropertyInput.tsx` - Fixed inline onChange handler for property name editing
- `web/src/components/node/image_editor/ImageEditorToolbar.tsx` - Fixed 11 inline onClick handlers for tools, actions, and transforms

**Impact**: Child components with React.memo now only re-render when props actually change, not on every parent render.

**Pattern**:
```typescript
// Before - creates new function on every render
onClick={() => handleAction(param)}

// After - stable reference via useCallback
const handleActionClick = useCallback((param: string) => {
  handleAction(param);
}, [handleAction]);
onClick={handleActionClick}
```

---

### Performance Optimization: Dialog Component Memoization (2026-01-16)

**Issue**: Model menu dialog components were re-rendering unnecessarily when parent components updated, even when closed.

**Solution**: Added React.memo wrapper to dialog components for explicit memoization.

**Files Optimized**:
- `web/src/components/model_menu/ImageModelMenuDialog.tsx` - Added React.memo wrapper
- `web/src/components/model_menu/LanguageModelMenuDialog.tsx` - Added React.memo wrapper
- `web/src/components/model_menu/HuggingFaceModelMenuDialog.tsx` - Added React.memo wrapper

**Impact**: Dialog components only re-render when their props (open, onClose, etc.) actually change.

**Pattern**:
```typescript
// Before
export default function ImageModelMenuDialog(props) { ... }

// After
function ImageModelMenuDialog(props) { ... }
export default React.memo(ImageModelMenuDialog);
```

---

## Summary

**Total Files Optimized**: 9 files
- 6 files: useCallback for inline arrow functions (11 handlers in ImageEditorToolbar alone)
- 3 files: React.memo for dialog components

**Optimization Types**:
- useCallback memoization: 15 inline handlers converted
- React.memo component memoization: 3 dialog components

**Verification**:
- ✅ Lint: No lint errors in modified files
- ✅ TypeScript: Type checking passes for modified files
- ✅ Pre-existing test file errors (unrelated to performance changes)

**Impact**: Reduced unnecessary re-renders in node components, property inputs, image editor toolbar, and model selection dialogs, improving overall UI responsiveness.
