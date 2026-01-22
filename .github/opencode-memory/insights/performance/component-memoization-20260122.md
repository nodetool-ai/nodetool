# Performance Optimization Insights

## Component Memoization (2026-01-22)

**What**: Added React.memo to 4 color picker components (SaturationPicker, HueSlider, AlphaSlider) and WelcomePanel to prevent unnecessary re-renders.

**Files**:
- `web/src/components/color_picker/SaturationPicker.tsx`
- `web/src/components/color_picker/HueSlider.tsx`
- `web/src/components/color_picker/AlphaSlider.tsx`
- `web/src/components/dashboard/WelcomePanel.tsx`

**Impact**: Color picker components now only re-render when their props change, reducing re-renders when parent components update.

---

## Handler Memoization (2026-01-22)

**What**: Memoized inline event handlers in HuggingFaceModelSearch and ModelPackCard using useCallback.

**Files**:
- `web/src/components/hugging_face/HuggingFaceModelSearch.tsx` - Added handleSearchChange, handleModelSelect, handleSubmit callbacks
- `web/src/components/hugging_face/ModelPackCard.tsx` - Added handleToggleExpand callback

**Impact**: Stable function references reduce unnecessary re-renders in model search and download components.

---

## Inline Arrow Function Memoization Summary (2026-01-22)

**What**: Fixed 45+ inline arrow functions across 18 components using .bind() and useCallback for stable references.

**Categories Fixed**:
1. **Node Menu Components** (9 files): SearchResults, FavoritesTiles, RecentNodesTiles, QuickActionTiles, RenderNodes, RenderNodesSelectable, NodeInfo, TypeFilterChips, SearchResultsPanel
2. **Dashboard Components** (4 files): BackToDashboardButton, ProviderSetupPanel, PaneContextMenu, WelcomePanel
3. **Asset Components** (5 files): AssetDeleteConfirmation, AssetTree, AssetMoveToFolderConfirmation, AssetRenameConfirmation, AssetCreateFolderConfirmation
4. **Model Components** (4 files): ModelTypeSidebar, DownloadProgress, OverallDownloadProgress, ModelListItem

**Impact**: Reduced re-renders in node menus, search results, workflow lists, asset management, and model download components.

---

## Zustand Selective Subscriptions (Multiple Sessions)

**What**: Extended Zustand store subscription optimization to components that were using full store destructuring.

**Pattern Applied**:
```typescript
// Before - subscribes to entire store
const store = useNodeStore();
const node = store.nodes[nodeId];

// After - selective subscription
const node = useNodeStore(state => state.nodes[nodeId]);
```

**Files Updated**: Multiple files across web/src/components

**Impact**: Components only re-render when their specific data changes, not on any store update.

---

## Event Listener Cleanup (2026-01-22)

**What**: Verified that all color picker components have proper event listener cleanup in useEffect return functions.

**Files Verified**:
- `web/src/components/color_picker/SaturationPicker.tsx`
- `web/src/components/color_picker/HueSlider.tsx`
- `web/src/components/color_picker/AlphaSlider.tsx`

**Pattern**:
```typescript
useEffect(() => {
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, [handleResize]);
```

**Impact**: Prevents memory leaks when components unmount.

---

## Previous Performance Optimizations

### Plotly Lazy Loading (2026-01-21)
- Lazy-loaded Plotly (4.6 MB charting library) using React.lazy
- Initial bundle smaller; library loads only when needed

### Asset List Virtualization (2026-01-16)
- Added virtualization to AssetListView using react-window
- Asset list with 1000+ assets renders in <100ms vs 3-5s before

### TabPanel Memoization (2026-01-22)
- Memoized 4 TabPanel components (SettingsMenu, Welcome, Help, RecommendedModelsDialog)
- Settings menus and dialogs now only re-render active tab content

### Component Memoization (Multiple Sessions)
- Added React.memo to large components: FloatingToolBar (720 lines), QuickActionTiles (640 lines)
- Two remaining large components now memoized

### Handler Memoization (Multiple Sessions)
- Memoized inline event handlers in GettingStartedPanel and WorkspacesManager
- Stable function references reduce re-renders
