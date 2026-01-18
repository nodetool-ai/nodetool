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
> ### FeatureName (YYYY-MM-DD)
> **What**: One sentence
> **Files**: Main files changed
> **Impact**: Brief impact statement

### Workflow Performance Profiler (2026-01-18)

**What**: Added experimental Workflow Performance Profiler feature that analyzes workflow execution, identifies bottlenecks, and displays node timing details with percentage of total runtime.

**Files**: PerformanceAnalysisStore.ts, PerformancePanel.tsx, PanelRight.tsx, RightPanelStore.ts

**Impact**: Users can now analyze workflow performance, view individual node execution times, and identify top bottlenecks (top 3 slowest nodes) via a new Performance panel accessible via the Speed icon in the right toolbar.

---

### Debug Console Statement Removal (2026-01-17)

**What**: Removed debug console.log statements from 6 production files.

**Files**: VersionHistoryPanel.tsx, ImageEditorModal.tsx, ImageEditorCanvas.tsx, MessageContentRenderer.tsx, NodeMenu.tsx, GlobalWebSocketManager.ts

**Impact**: Cleaned up development debug statements from production code.

---

### Mobile TypeScript Type Definitions Fix (2026-01-17)

**What**: Fixed mobile package type checking by installing missing @types/jest and @types/node packages.

**Files**: mobile/package.json, mobile/package-lock.json

**Impact**: All packages now pass type checking.

---

### Performance Optimization: Large Component Memoization (2026-01-17)

**What**: Added React.memo to 6 large unmemoized components.

**Files**: Welcome.tsx, SettingsMenu.tsx, Model3DViewer.tsx, EditorController.tsx, AssetViewer.tsx, AgentExecutionView.tsx

**Impact**: Large components only re-render when props change, improving editor performance.

---

### Workspace Explorer UX Improvements (2026-01-17)

**What**: Improved error and empty state messages in workspace explorer.

**Files**: WorkspaceSelect.tsx, WorkspacesManager.tsx, WorkspaceTree.tsx

**Impact**: Users see helpful messages instead of generic errors.

---

### Keyboard Node Navigation (2026-01-13)

**What**: Added Tab-based keyboard navigation for node editor.

**Files**: NodeFocusStore.ts, useNodeFocus.ts, shortcuts.ts

**Impact**: Users can navigate between nodes using keyboard shortcuts.

---

> **Format**: `Feature (date): One line. Files: x, y`
> **Limit**: 5 most recent entries. Delete oldest when adding new.
