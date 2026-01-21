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

### Performance Audit (2026-01-21)

**What**: Comprehensive performance audit confirms all major optimizations are already in place - Zustand selective subscriptions (41 components), React.memo (41 components), list virtualization (17 components), and memory leak prevention.

**Files**: No code changes required - audit documented in `.github/opencode-memory/insights/performance/audit-summary-20260121.md`

**Impact**: Codebase is well-optimized. Verified: 3134/3138 tests pass, 1 lint warning only.

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
