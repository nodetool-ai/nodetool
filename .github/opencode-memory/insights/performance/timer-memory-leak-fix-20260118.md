### Performance Fix: Timer Memory Leak Cleanup (2026-01-18)

**Issue**: setTimeout callbacks in copy handlers were not being cleared on component unmount, causing potential state updates on unmounted components (memory leaks).

**Measurement**: Found 2 components with timer memory leaks:
- `ColorPickerModal.tsx` - setTimeout for clearing copied format indicator (1500ms)
- `MiniAppResults.tsx` - setTimeout for clearing copied result indicator (2000ms)

**Solution**: Added timeout tracking with useRef and cleanup via useEffect return function.

**Files Fixed**:
- `web/src/components/color_picker/ColorPickerModal.tsx`:
  - Added `useRef` import
  - Added `copyTimeoutRef` to track timeout ID
  - Added useEffect cleanup to clear timeout on unmount
  - Updated copyColor handler to clear previous timeout before setting new one

- `web/src/components/miniapps/components/MiniAppResults.tsx`:
  - Added `useRef` and `useEffect` imports
  - Added `copyTimeoutRef` to track timeout ID
  - Added useEffect cleanup to clear timeout on unmount
  - Updated handleCopy function to clear previous timeout before setting new one

**Impact**: Prevents state updates on unmounted components, eliminating potential memory leaks and React warnings.

**Pattern**:
```typescript
// Add ref tracking
const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// Add cleanup in useEffect
useEffect(() => {
  return () => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
  };
}, []);

// Clear previous timeout before setting new one
if (copyTimeoutRef.current) {
  clearTimeout(copyTimeoutRef.current);
}
copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
```

**Verification**:
- ✅ TypeScript: Passes
- ✅ ESLint: Passes (web package)
- ✅ Tests: 3089 tests pass

---
