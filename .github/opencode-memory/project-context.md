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

### Comment Nodes Feature (2026-01-19)

**What**: Added Comment node type for documenting workflows directly on the canvas with sticky-note style editable text nodes.

**Files**: web/src/components/node_types/CommentNode.tsx, web/src/serverState/useMetadata.ts, web/src/components/node_menu/QuickActionTiles.tsx, web/src/stores/NodeStore.ts

---

### FavoriteWorkflowsStore Test Fix (2026-01-19)

**What**: Fixed tests using incorrect `.actions` API on Zustand store. Methods are directly on state object, not nested under actions.

**Files**: web/src/stores/__tests__/FavoriteWorkflowsStore.test.ts

**Impact**: All 9 tests now pass, type checking passes.

---

### Lint Warning Fix (2026-01-19)

**What**: Fixed unused type definition warning by using `SurroundWithGroupOptions` type in function signature instead of inline type.

**Files**: web/src/hooks/nodes/useSurroundWithGroup.ts

**Impact**: No lint warnings or errors.

---

### Component Memoization (2026-01-18)

**What**: Added React.memo to 12 unmemoized components (Dashboard, ProviderSetupPanel, TemplatesPanel, WorkflowsList, WorkflowListView, WorkflowToolbar, OutputContextMenu, SelectionContextMenu, InputContextMenu, NodeContextMenu, PropertyContextMenu, EdgeContextMenu).

**Files**: 12 files in web/src/components/

**Impact**: Reduced unnecessary re-renders in dashboard, workflow management, and context menu components.
### Quality Checks Fixes (2026-01-18)

**What**: Fixed TypeScript type errors and lint warnings in test files.

**Files**: web/src/hooks/nodes/__tests__/useDynamicOutput.test.ts, web/src/hooks/nodes/__tests__/useDynamicProperty.test.ts, and 4 other test files

**Impact**: All quality checks now pass (typecheck, lint, tests).

---

## Code Quality Standards
