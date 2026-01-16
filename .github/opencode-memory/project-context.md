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

> **Format**: `Feature (date): One line. Files: x, y`
> **Limit**: 5 most recent entries. Delete oldest when adding new.

- **Workflow Performance Profiler (2026-01-16)**: Added experimental profiler for analyzing workflow complexity, detecting bottlenecks, and providing optimization recommendations. Files: workflowProfiler.ts, WorkflowProfilerStore.ts, WorkflowProfilerPanel.tsx
- **Zoom Presets (2026-01-14)**: Added zoom in/out buttons, presets dropdown (25-200%), keyboard shortcuts. Files: ViewportStatusIndicator.tsx, shortcuts.ts
- **Node Execution Time (2026-01-14)**: Shows execution duration on completed nodes. Files: ExecutionTimeStore.ts, NodeExecutionTime.tsx
- **Keyboard Node Navigation (2026-01-13)**: Tab/Shift+Tab and Alt+Arrows to navigate nodes. Files: NodeFocusStore.ts, useNodeFocus.ts
- **Zustand Selector Optimization (2026-01-11)**: Fixed components subscribing to entire stores. Files: WorkflowAssistantChat.tsx, AppHeader.tsx
