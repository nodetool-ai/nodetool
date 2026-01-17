### Performance Optimization: Inline Handler Memoization (2026-01-17)

**Issue**: Multiple components had inline arrow functions in JSX `onClick` handlers that created new function references on every render, causing unnecessary child component re-renders.

**Measurement**: Components with frequent updates were creating 2-7 new function instances per render cycle.

**Solution**: Wrapped handlers in `useCallback` hooks and added `React.memo` to large components.

**Files Optimized**:
- `web/src/components/node/DataTable/TableActions.tsx` - Added useCallback for 6 handlers, wrapped with React.memo
- `web/src/components/node/NodeToolButtons.tsx` - Fixed 2 inline sync mode handlers, added React.memo
- `web/src/components/dialogs/FileBrowserDialog.tsx` - Memoized Row component and 5 handlers, wrapped handleNavigate in useCallback
- `web/src/components/dialogs/OpenOrCreateDialog.tsx` - Added useCallback for handleOrderChange, wrapped with React.memo
- `web/src/components/content/Welcome/Welcome.tsx` - Added React.memo (925 lines)
- `web/src/components/menus/SettingsMenu.tsx` - Added React.memo (919 lines)

**Impact**: Reduced unnecessary re-renders in table actions, node toolbars, file browser, and dialog components. Large page components (Welcome, SettingsMenu) now only re-render when props change.

**Pattern**:
```typescript
// Before - creates new function on every render
<IconButton onClick={() => handleAction(id)} />

// After - stable reference
const handleAction = useCallback((id: string) => {...}, [id]);
<IconButton onClick={() => handleAction(id)} />
// Or better - pass stable reference directly
const handleActionClick = useCallback(() => handleAction(id), [id]);
<IconButton onClick={handleActionClick} />
```

---

### Performance Optimization: Component Memoization (2026-01-17)

**Issue**: Large components (900+ lines) were re-rendering on every parent update even when their props hadn't changed.

**Solution**: Added `React.memo` to prevent unnecessary re-renders.

**Files Optimized**:
- `web/src/components/content/Welcome/Welcome.tsx` (925 lines)
- `web/src/components/menus/SettingsMenu.tsx` (919 lines)

**Impact**: These large page-level components now only re-render when their actual props change, improving overall page performance.

**Pattern**:
```typescript
// Before
export default Welcome;

// After
import { memo } from "react";
export default memo(Welcome);
```

---

### Performance Optimization: Callback Dependency Fix (2026-01-17)

**Issue**: `handleNavigate` in FileBrowserDialog.tsx was defined as a regular function but used inside useCallback hooks, causing ESLint warnings and potential stale closure issues.

**Solution**: Wrapped `handleNavigate` in useCallback with proper dependency.

**Files Fixed**:
- `web/src/components/dialogs/FileBrowserDialog.tsx`

**Impact**: Fixed ESLint warnings and ensured consistent behavior across callback chains.

**Pattern**:
```typescript
// Before
const handleNavigate = (path: string) => {...};

// After
const handleNavigate = useCallback((path: string) => {...}, [selectionMode]);
```
