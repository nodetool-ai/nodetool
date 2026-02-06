# NodeTool Project Context

## Overview

NodeTool: Open-source, privacy-first, visual AI workflow builder. Drag-and-drop node interface, no coding required.

## Architecture

| Component | Path | Stack |
|-----------|------|-------|
| Web UI | `/web` | React 18.2, TypeScript 5.7, ReactFlow, MUI v7, Zustand, TanStack Query |
| Electron | `/electron` | Desktop wrapper, local Python env, file system |
| Mobile | `/mobile` | React Native/Expo |
| Backend | (separate repo) | Python API server, WebSocket |

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

> MAX 5 entries. Delete oldest when adding new. Format: `### Title (date)` + one-line summary + files.

### Plotly Lazy Loading (2026-01-21)
Lazy-loaded Plotly (4.6 MB) using React.lazy. Files: PlotlyRenderer.tsx, OutputRenderer.tsx

### Asset List Virtualization (2026-01-16)
Virtualized AssetListView with react-window for 1000+ assets. Files: AssetListView.tsx

### Keyboard Node Navigation (2026-01-13)
Tab-based keyboard navigation for node editor. Files: NodeFocusStore.ts, useNodeFocus.ts, BaseNode.tsx

### Zustand Subscription Optimization (2026-01-11)
Converted components from full store destructuring to selective selectors. Files: WorkflowAssistantChat.tsx, AppHeader.tsx, WelcomePanel.tsx

### Zoom Presets (2026-01-14)
Added zoom presets to ViewportStatusIndicator. Files: ViewportStatusIndicator.tsx, shortcuts.ts
