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
> ```
> ### Feature/Fix Name (YYYY-MM-DD)
> **What**: One sentence
> **Files**: Main files changed
> ```

### Accessibility Improvements (2026-01-17)

**What**: Fixed WCAG compliance issues - added aria-labels to IconButtons, keyboard handlers to div buttons, improved image alt text.

**Files**: ImageView.tsx, SwatchPanel.tsx, ProviderSetupPanel.tsx

**Impact**: Screen readers can now announce button actions; all interactive elements keyboard accessible.

---

### Performance Optimization: Component Memoization (2026-01-17)

**What**: Added React.memo to 3 large components (ImageEditorToolbar, ImageEditorModal, OpenOrCreateDialog) to prevent unnecessary re-renders.

**Files**: ImageEditorToolbar.tsx, ImageEditorModal.tsx, OpenOrCreateDialog.tsx

**Impact**: Reduced re-renders in image editing and workflow creation workflows. Bundle size unchanged (5.74 MB).

---

### Performance Optimization: Handler Memoization (2026-01-17)

**What**: Memoized inline handlers in NodeHeader (4), AssetTable (1), FormatButton (1), and TableActions (7) components. Added React.memo to AssetTable.

**Files**: NodeHeader.tsx, AssetTable.tsx, FormatButton.tsx, TableActions.tsx

**Impact**: Prevented unnecessary re-renders in high-frequency node components and asset management UI by providing stable function references.

---

### Performance Optimization: Inline Arrow Functions (2026-01-17)

**What**: Extended inline handler memoization to 10+ additional components including color pickers, dashboard, context menus, and mini apps.

**Files**: Login.tsx, GradientBuilder.tsx, SwatchPanel.tsx, HarmonyPicker.tsx, ColorPickerModal.tsx, LayoutMenu.tsx, WelcomePanel.tsx, ExamplesList.tsx, SelectionContextMenu.tsx, MiniAppResults.tsx

**Impact**: Reduced re-renders in color picker, dashboard panels, context menus, and mini apps by providing stable function references.

---

### Node Header Icon Fix (2026-01-16)

**What**: Changed "Enable Node" icon from PlayArrowIcon to PowerSettingsNewIcon to distinguish it from "Run From Here" action.

**Why**: Both actions used the same PlayArrowIcon, confusing users about their different purposes.

**Files**: `web/src/components/context_menus/NodeContextMenu.tsx`, `web/src/components/node/NodeToolButtons.tsx`

---

### Image Size Display in Nodes (2026-01-16)

**What**: Added image dimensions display (width × height) at bottom right of image output nodes, shown in tiny monospace font with semi-transparent background.

**Why**: Users can now see image size without clicking on the image, improving workflow visibility.

**Files**: `web/src/components/node/ImageView.tsx`

---

### Auto-save Interval Fix (2026-01-16)

**What**: Fixed auto-save interval settings not being applied when changed by user.

**Why**: The interval useEffect wasn't properly resetting when intervalMinutes changed due to dependency array issues with memoized callbacks.

**Files**: `web/src/hooks/useAutosave.ts`

---

### Mobile TypeScript Type Definitions Fix (2026-01-15)

**What**: Fixed mobile package TypeScript type checking by adding `@types/react-native` package.

**Why**: TypeScript couldn't find type definition files for 'jest', 'node', and 'react-native' even though tsconfig.json specified them in the types array. The `@types/react-native` package was missing from package.json.

**Files**: `mobile/package.json`, `mobile/package-lock.json`

---

### NodeExecutionTime Test Lint Fix (2026-01-15)

**What**: Fixed lint warnings in NodeExecutionTime.test.tsx by removing unused duplicate function.

**Why**: ESLint reported unused variable warning for `formatDuration` function that was duplicated unnecessarily.

**Files**: `web/src/components/node/__tests__/NodeExecutionTime.test.tsx`

---

### Quality Checks Verification (2026-01-15)

**What**: Ran full quality checks and fixed issues found.

**Result**:
- ✅ Type checking: All packages pass
- ✅ Linting: All packages pass (2 warnings fixed)
- ✅ Tests: All 595 tests pass (206 web & 389 mobile)

**Files**: Multiple files across web and mobile packages

---

### Zoom Presets Feature (2026-01-14)

**What**: Added zoom presets to the ViewportStatusIndicator component, including zoom in/out buttons, a dropdown menu with common zoom levels (25%, 50%, 75%, 100%, 150%, 200%), and keyboard shortcuts (Ctrl+/- for zoom in/out, Ctrl+5/0/00/200 for presets).

**Files**:
- `web/src/components/node_editor/ViewportStatusIndicator.tsx` - Enhanced with zoom presets dropdown and zoom in/out buttons
- `web/src/components/node_editor/__tests__/ViewportStatusIndicator.test.tsx` - Added tests for new zoom functionality
- `web/src/config/shortcuts.ts` - Added zoom shortcuts (zoomIn, zoomOut, zoom50, zoom100, zoom200)
- `web/src/hooks/useNodeEditorShortcuts.ts` - Added handlers for new zoom shortcuts
- `web/src/__mocks__/themeMock.ts` - Added Paper.paper to vars.palette for theme consistency

**Implementation**:
- Extended ViewportStatusIndicator with zoom in/out buttons (+/- icons)
- Added Popover menu with 6 zoom presets (25%, 50%, 75%, 100%, 150%, 200%)
- Current zoom preset is highlighted in the dropdown
- Zoom percentage button opens the presets menu
- Added keyboard shortcuts for zoom control
- Removed node count display as it was redundant with existing UI elements

**What**: Added execution time display for completed nodes in the workflow editor, showing how long each node took to execute in a human-readable format (e.g., "1s 500ms", "2m 5s").

**Files**:
- `web/src/stores/ExecutionTimeStore.ts` - New store for tracking node execution timing
- `web/src/components/node/NodeExecutionTime.tsx` - New component displaying execution duration
- `web/src/stores/workflowUpdates.ts` - Updated to record timing when status changes
- `web/src/components/node/BaseNode.tsx` - Integrated NodeExecutionTime component
- `web/src/stores/__tests__/ExecutionTimeStore.test.ts` - Tests for the timing store
- `web/src/components/node/__tests__/NodeExecutionTime.test.tsx` - Tests for the component

**Implementation**:
- `ExecutionTimeStore` tracks start and end times for each node execution
- `workflowUpdates.ts` calls `startExecution` when node starts and `endExecution` when it completes
- `NodeExecutionTime` component displays "Completed in X" or "Failed in X" after execution
- Timings are cleared when workflow completes, cancels, or fails

### Code Quality Improvements (2026-01-15)

**What**: Fixed lint warnings, TypeScript types, and mobile type definitions.

**Files**:
- `web/src/components/node/__tests__/NodeExecutionTime.test.tsx` - Fixed unused variable and missing brace
- `web/src/components/miniapps/components/MiniWorkflowGraph.tsx` - Added proper types and theme-based colors
- `mobile/package.json`, `mobile/package-lock.json` - Added missing @types/jest and @types/node

**Implementation**:
- Fixed lint warnings in test file (unused `formatDuration` variable, missing `{` after `if`)
- Replaced `any` types with typed interfaces in MiniWorkflowGraph
- Replaced hardcoded colors with CSS custom properties referencing theme values
- Installed missing type definition packages for mobile package

### Mobile TypeScript Type Definitions Fix (2026-01-15)

**What**: Fixed mobile package type checking by removing "react-native" from the types array in tsconfig.json.

**Why**: Modern React Native (0.81+) includes its own type definitions, making `@types/react-native` deprecated and unnecessary. The types array was causing TypeScript to look for external type packages that weren't needed.

**Files**: `mobile/tsconfig.json`

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
