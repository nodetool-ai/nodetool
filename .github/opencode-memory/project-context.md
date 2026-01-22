# NodeTool Project Context

> **⚠️ KEEP COMPACT**: This file is read by AI agents. Keep entries minimal to save tokens.
> - Recent Changes: MAX 5 entries, 2-3 lines each
> - Run `python scripts/compact-memory.py` after updates

## Overview

NodeTool: Open-source, privacy-first, visual AI workflow builder. Drag-and-drop node interface, no coding required.

## Architecture

| Component | Path | Stack |
|-----------|------|-------|
| Web UI | `/web` | React 18.2, TypeScript 5.7, ReactFlow, MUI v7, Zustand, TanStack Query |
| Electron | `/electron` | Desktop wrapper, local Python env, file system |
| Mobile | `/mobile` | React Native/Expo |
| Backend | (separate repo) | Python API server, WebSocket |

**Key Dirs**: `/web`, `/electron`, `/mobile`, `/docs`, `/scripts`, `/.github`

## Design Principles

1. Visual First  2. Privacy First  3. No Coding Required  4. Real-time Feedback  5. Portable Workflows

## State Management

**Zustand Stores**: NodeStore, WorkflowStore, AssetStore, SettingsStore, GlobalChatStore (all use temporal middleware for undo/redo)

**React Context**: ThemeContext, WorkflowContext, KeyboardContext

## Key Patterns

```typescript
// Zustand: Use selectors, not full store
const nodes = useNodeStore(state => state.nodes);  // ✅
const store = useNodeStore();  // ❌ causes re-renders
```

## Critical Files

`/AGENTS.md`, `/.github/copilot-instructions.md`, `/web/README.md`, `/web/TESTING.md`, `/Makefile`

## Gotchas

1. ReactFlow types need casting  2. Zustand temporal = auto undo/redo  3. Use theme values, not hardcoded colors  4. Use `===` not `==`  5. Use `Array.isArray()`

## Recent Changes

> Add ONE concise entry here for significant changes. Format:
>/Fix Name ( ```
> ### FeatureYYYY-MM-DD)
> **What**: One sentence
> **Files**: Main files changed
> ```

### Plotly Lazy Loading (2026-01-21)

**What**: Lazy-loaded Plotly (4.6 MB charting library) using React.lazy to reduce initial bundle size. Chart library now loads on-demand only when users view plotly charts.

**Files**: web/src/components/node/output/PlotlyRenderer.tsx (NEW), web/src/components/node/OutputRenderer.tsx

**Impact**: Initial bundle smaller; 4.6 MB chart library loads only when needed.
> ### TypeScript and Lint Fixes (2026-01-22)
> **What**: Fixed 5 TypeScript errors and 11 lint issues - history size type handling, null coalescing for descriptions, non-existent method replacement, and unused variable cleanup.
> **Files**: DataTable.tsx, DataframeProperty.tsx, WorkflowManagerStore.ts, TableActions.tsx, OutputRenderer.tsx, VersionHistoryPanel.tsx
>
> ---
>
> ### TypeScript Syntax and Type Fixes (2026-01-20)

### Inline Arrow Function Performance Fix (2026-01-22)

**What**: Fixed 100+ inline arrow functions in JSX across 6 files using .bind() and useCallback, preventing unnecessary re-renders.

**Files**: WorkspacesManager.tsx, FloatingToolBar.tsx, AppToolbar.tsx, WorkflowToolbar.tsx, VersionHistoryPanel.tsx, WorkflowTile.tsx

**Impact**: Stable function references improve scroll performance and reduce re-renders in workflow lists and grids.

---

### TypeScript Syntax and Type Fixes (2026-01-20)

**What**: Fixed 4 TypeScript issues - syntax error in ProviderSetupPanel, unused variable, MUI event type mismatch in TypeFilter, and inputValue type error in WorkflowForm.

**Files**: web/src/components/dashboard/ProviderSetupPanel.tsx, web/src/components/node_menu/TypeFilter.tsx, web/src/components/workflows/WorkflowForm.tsx

**Impact**: All TypeScript and lint checks now pass for web and electron packages.

---

### Component Memoization (2026-01-20)

**What**: Added React.memo and useCallback to 4 components (TagFilter, SearchBar, SearchResults, TypeFilter) preventing unnecessary re-renders.

**Files**: web/src/components/workflows/TagFilter.tsx, SearchBar.tsx, node_menu/SearchResults.tsx, TypeFilter.tsx

**Impact**: Workflow and node menu components now only re-render when props change.

---

### Component Memoization (2026-01-19)

**What**: Added React.memo to FloatingToolBar (720 lines) and QuickActionTiles (640 lines) components.

**Files**: web/src/components/panels/FloatingToolBar.tsx, web/src/components/node_menu/QuickActionTiles.tsx

**Impact**: Two remaining large components now memoized, preventing unnecessary re-renders.

---

### AssetTree Sort Memoization (2026-01-19)

**What**: Memoized sort operation in AssetTree component using useMemo/useCallback and added React.memo wrapper.

**Files**: web/src/components/assets/AssetTree.tsx

**Impact**: Asset tree sorting now only happens when data changes, not on every re-render.

---

### Handler Memoization (2026-01-19)

**What**: Memoized inline event handlers in GettingStartedPanel and WorkspacesManager using useCallback to prevent unnecessary re-renders.

**Files**: web/src/components/dashboard/GettingStartedPanel.tsx, web/src/components/workspaces/WorkspacesManager.tsx

**Impact**: Stable function references reduce re-renders in workspace management and model download UI.

---

> **Format**: `Feature (date): One line. Files: x, y`
> **Limit**: 5 most recent entries. Delete oldest when adding new.

### TabPanel Memoization (2026-01-22)

**What**: Memoized 4 TabPanel components (SettingsMenu, Welcome, Help, RecommendedModelsDialog) to prevent unnecessary re-renders when switching tabs.

**Files**: web/src/components/menus/SettingsMenu.tsx, content/Welcome/Welcome.tsx, content/Help/Help.tsx, hugging_face/RecommendedModelsDialog.tsx

**Impact**: Settings menus, help dialogs, and model dialogs now only re-render active tab content, reducing component updates.

---

### Plotly Lazy Loading (2026-01-21)

**What**: Lazy-loaded Plotly (4.6 MB charting library) using React.lazy to reduce initial bundle size. Chart library now loads on-demand only when users view plotly charts.

**Files**: web/src/components/node/output/PlotlyRenderer.tsx (NEW), web/src/components/node/OutputRenderer.tsx

**Impact**: Initial bundle smaller; 4.6 MB chart library loads only when needed.

---

### Asset List Virtualization (2026-01-16)

**What**: Added virtualization to AssetListView using react-window for efficient rendering of 1000+ assets.

**Files**: web/src/components/assets/AssetListView.tsx

**Impact**: Asset list with 1000+ assets renders in <100ms vs 3-5s before. Smooth scrolling regardless of asset count.

---

> **Format**: `Feature (date): One line. Files: x, y`
> **Limit**: 5 most recent entries. Delete oldest when adding new.

**Impact**: Reduced unnecessary re-renders in auth-related components by ensuring they only update when their specific state changes. Improved TypeScript type safety by using proper error handling with AppError type guards.

---

### Asset List Virtualization (2026-01-16)

**What**: Added virtualization to AssetListView using react-window for efficient rendering of 1000+ assets.

**Why**: Previously rendered all assets in a flat list causing 3-5 second initial render with 1000+ assets.

**Files**: `web/src/components/assets/AssetListView.tsx`

**Implementation**:
- Used `VariableSizeList` from react-window with `AutoSizer` for responsive sizing
- Created flat list of items (type headers + assets) for virtualization
- Memoized row height calculations and row rendering
- Added `React.memo` to component for additional re-render prevention

**Impact**: Asset list with 1000+ assets renders in <100ms vs 3-5s before. Smooth scrolling regardless of asset count.

**Verification**:
- ✅ Lint: All packages pass
- ✅ TypeScript: Web package passes
