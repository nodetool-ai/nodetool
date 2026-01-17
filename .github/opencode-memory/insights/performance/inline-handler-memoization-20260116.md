# Performance Optimizations (2026-01-16)

## Summary

Fixed inline arrow functions causing unnecessary re-renders and added React.memo to large dialog components.

## Optimizations Made

### 1. Inline Arrow Function Memoization

**Problem**: Components had inline arrow functions in event handlers that created new function references on every render.

**Files Fixed**:
- `ImageEditorToolbar.tsx`: Memoized 7 tool selection handlers and 5 action handlers
- `NodeColorSelector.tsx`: Memoized color selection callback factory
- `NodeLogs.tsx`: Memoized severity toggle handlers (info, warning, error)
- `NodeDescription.tsx`: Memoized tag click handler + added React.memo wrapper
- `OutputRenderer.tsx`: Original inline function kept due to useCallback hook restrictions in switch cases

**Pattern Applied**:
```typescript
// Before - creates new function on every render
onClick={() => handleAction("param")}

// After - memoized callback factory
const handleAction = useCallback((param: string) => {...}, [...]);
const handleActionParam = useCallback(() => handleAction("param"), [handleAction]);
onClick={handleActionParam}
```

### 2. Component Memoization

**Problem**: Large dialog components re-rendered unnecessarily when parent components updated.

**Files Updated**:
- `ImageModelMenuDialog.tsx`: Added React.memo wrapper (36 lines)
- `LanguageModelMenuDialog.tsx`: Added React.memo wrapper (37 lines)
- `HuggingFaceModelMenuDialog.tsx`: Added React.memo wrapper (118 lines)
- `FileBrowserDialog.tsx`: Added React.memo wrapper (851 lines - largest)
- `NodeDescription.tsx`: Added React.memo wrapper + fixed hooks order

**Impact**:
- Large dialogs (851 lines) now only re-render when props change
- Frequently used model selection dialogs optimized

## Files Modified

- `web/src/components/node/image_editor/ImageEditorToolbar.tsx`
- `web/src/components/node/NodeColorSelector.tsx`
- `web/src/components/node/NodeLogs.tsx`
- `web/src/components/node/NodeDescription.tsx`
- `web/src/components/node/OutputRenderer.tsx`
- `web/src/components/model_menu/ImageModelMenuDialog.tsx`
- `web/src/components/model_menu/LanguageModelMenuDialog.tsx`
- `web/src/components/model_menu/HuggingFaceModelMenuDialog.tsx`
- `web/src/components/dialogs/FileBrowserDialog.tsx`

## Performance Impact

**Estimated Improvements**:
- Reduced unnecessary re-renders in node editor toolbar (ImageEditorToolbar)
- Prevented re-renders of large FileBrowserDialog (851 lines) on parent updates
- Optimized model selection dialogs that open frequently
- Fixed hooks rule violation in NodeDescription that could cause undefined behavior

## Pattern for Future Development

When adding event handlers with parameters to JSX:

```typescript
// ✅ Good - memoized handler with factory
const handleClick = useCallback((id: string) => {...}, [...]);
const handleClickId = useCallback(() => handleClick("id"), [handleClick]);
onClick={handleClickId}

// ✅ Good - simple handler without parameters
const handleClick = useCallback(() => {...}, [...]);
onClick={handleClick}

// ❌ Bad - inline arrow function
onClick={() => handleClick("id")}

// ❌ Bad - hooks after early return
if (condition) return null;
useCallback(...); // Violates rules of hooks
```

## Date

2026-01-16
