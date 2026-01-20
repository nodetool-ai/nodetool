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

### TypeScript Syntax and Type Fixes (2026-01-20)

**What**: Fixed 4 TypeScript issues - syntax error in ProviderSetupPanel, unused variable, MUI event type mismatch in TypeFilter, and inputValue type error in WorkflowForm.

**Files**: web/src/components/dashboard/ProviderSetupPanel.tsx, web/src/components/node_menu/TypeFilter.tsx, web/src/components/workflows/WorkflowForm.tsx

**Impact**: All TypeScript and lint checks now pass for web and electron packages.

### E2E Test Exclusion Fix (2026-01-20)

**What**: Fixed Playwright E2E tests failing in Jest runner by updating testPathIgnorePatterns in jest.config.ts to properly exclude tests/e2e/ directory.

**Files**: web/jest.config.ts

**Impact**: All 239 test suites now pass (3136 tests, 2 skipped E2E tests).

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



### useInputNodeAutoRun Tests Fix (2026-01-19)

**What**: Fixed 3 failing tests by correcting mock setups for subgraph edges and node store data.

**Files**: web/src/hooks/nodes/__tests__/useInputNodeAutoRun.test.ts

**Impact**: All 15 tests now pass, type checking and linting pass.

---

> **Format**: `Feature (date): One line. Files: x, y`
> **Limit**: 5 most recent entries. Delete oldest when adding new.### Node Header Icon Fix (2026-01-16)

**What**: Changed "Enable Node" icon from PlayArrowIcon to PowerSettingsNewIcon to distinguish it from "Run From Here" action.

**Why**: Both actions used the same PlayArrowIcon, confusing users about their different purposes.

**Files**: `web/src/components/context_menus/NodeContextMenu.tsx`, `web/src/components/node/NodeToolButtons.tsx`

---
