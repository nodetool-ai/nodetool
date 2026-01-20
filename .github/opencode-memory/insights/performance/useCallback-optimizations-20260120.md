# Performance Optimization: useCallback Memoization (2026-01-20)

**What**: Added useCallback to 15+ inline arrow functions in render to prevent unnecessary re-renders.

## Components Optimized

### 1. Welcome.tsx (925 lines)

**Changes**:
- Added memoized handlers: `handleOpenDashboard`, `handleOpenEditor`, `handleOpenTemplates`, `handleOpenChat`, `handleOpenAssets`, `handleClearSearch`, `handleSearchChange`
- Wrapped `InlineModelDownload` component with `React.memo` and added `handleDownload` useCallback
- Replaced 10 inline arrow function handlers with memoized versions

**Impact**:
- 925-line Welcome component now has stable function references
- Navigation handlers only recreate when navigate changes
- Search handlers only recreate when dependencies change
- Model download handler prevents re-renders when download starts

**Files Changed**: `web/src/components/content/Welcome/Welcome.tsx`

### 2. FileBrowserDialog.tsx (831 lines)

**Changes**:
- Wrapped `handleTreeItemClick` with useCallback
- Wrapped `handlePathSubmit` with useCallback (fixing exhaustive-deps warning)
- Created `handlePathKeyDown` useCallback to replace inline keyboard handler

**Impact**:
- File browser tree navigation now uses stable callbacks
- Path editing now has proper memoization
- Fixes React lint warning about exhaustive deps

**Files Changed**: `web/src/components/dialogs/FileBrowserDialog.tsx`

## Pattern Applied

**Before**:
```typescript
<Button onClick={() => navigate("/dashboard")}>
  Open Dashboard
</Button>
```

**After**:
```typescript
const handleOpenDashboard = useCallback(() => {
  navigate("/dashboard");
}, [navigate]);

<Button onClick={handleOpenDashboard}>
  Open Dashboard
</Button>
```

## Verification

- ✅ TypeScript: Web and Electron packages pass
- ✅ ESLint: All packages pass
- ✅ React display-name: Added for memoized InlineModelDownload component

## Related Documentation

- Previous useCallback work in `.github/opencode-memory/insights/`
- Performance optimization guidelines in `AGENTS.md`
