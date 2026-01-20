# Performance Optimization (2026-01-20)

## Optimizations Applied

### 1. AssetTree.tsx - Removed Redundant Sorting

**Issue**: The `renderAssetTree` function was calling `sortNodes(nodes)` on every render, even though `sortedAssetTree` was already sorted via `useMemo`.

**Fix**: 
- Wrapped `renderAssetTree` with `useCallback` 
- Removed redundant `sortNodes` call since input is already sorted
- Added proper dependencies to useCallback

**Impact**: Prevents unnecessary sorting operations when asset tree re-renders.

**File**: `web/src/components/assets/AssetTree.tsx`

### 2. TagFilter.tsx - Memoized Tag Button Handlers

**Issue**: Inline arrow function `onClick={() => handleSelectTag(tag)}` inside map created new function references on every render of the TagFilter component.

**Fix**:
- Created memoized `getTagButtonClickHandler` using `useCallback`
- Replaced inline arrow function with memoized handler

**Impact**: Reduces re-renders of button elements inside map when component updates.

**File**: `web/src/components/workflows/TagFilter.tsx`

### 3. WorkflowToolbar.tsx - Memoized Sort Menu Handlers

**Issue**: Inline arrow functions `onClick={() => handleSortChange("date")}` and similar in MenuItem components created new function references.

**Fix**:
- Created memoized `handleSortByDate` and `handleSortByName` using `useCallback`
- Replaced inline arrow functions with memoized handlers

**Impact**: Menu items now have stable function references, preventing unnecessary re-renders.

**File**: `web/src/components/workflows/WorkflowToolbar.tsx`

### 4. AssetActions.tsx - Full Component Memoization

**Issue**: Large component (490 lines) without React.memo wrapper, causing unnecessary re-renders.

**Fix**:
- Added `React.memo` wrapper to component
- Added `useCallback` for all inline handlers:
  - `handleSetCreateFolderAnchor`
  - `handleCloseCreateFolder`
  - `handleCreateFolderKeyDown`
  - `handleOrderChangeValue`
  - `handleSizeFilterValue`
- Renamed component to `AssetActionsComponent` for proper memoization

**Impact**: Component only re-renders when props actually change.

**File**: `web/src/components/assets/AssetActions.tsx`

## Performance Audit Findings

### Good Patterns Found (Already Optimized)
- ✅ AssetListView and AssetGridContent use react-window virtualization
- ✅ ExampleGrid and WorkflowListView use react-window virtualization  
- ✅ Most large components already wrapped with React.memo
- ✅ useCallback/useMemo used extensively in hooks and handlers
- ✅ Selective Zustand subscriptions used throughout

### Areas Already Optimized (From Memory)
- ✅ Asset list virtualization (1000+ assets render in <100ms)
- ✅ Asset tree sort memoization
- ✅ Handler memoization in GettingStartedPanel, WorkspacesManager
- ✅ Component memoization: FloatingToolBar, QuickActionTiles, TagFilter, SearchBar, SearchResults, TypeFilter

### Potential Future Optimizations (Not Applied)
- Bundle code-splitting for Plotly (4.68 MB) and Three.js (991 KB) - requires more extensive architectural changes
- Additional inline arrow function memoization in frequently-updated components

## Verification

- ✅ Lint: All packages pass
- ✅ Build: Successful (38M dist bundle)
- ✅ TypeScript: Web package passes (excluding pre-existing test file issues)
