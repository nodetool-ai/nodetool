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
> ### FeatureName (YYYY-MM-DD)
> **What**: One sentence
> **Files**: Main files changed
> ```

### Performance Profiler Research Feature (2026-01-18)

**What**: Implemented experimental workflow performance profiling UI with bottleneck detection, parallelism scoring, and optimization suggestions.

**Files**: web/src/stores/PerformanceProfilerStore.ts, web/src/hooks/useWorkflowPerformance.ts, web/src/components/performance/PerformanceProfilerPanel.tsx, web/src/components/performance/PerformanceTimeline.tsx

---

### Debug Console Statement Removal (2026-01-17)

**What**: Removed debug console.log statements from 6 production files.

**Files**: VersionHistoryPanel.tsx, ImageEditorModal.tsx, ImageEditorCanvas.tsx, MessageContentRenderer.tsx, NodeMenu.tsx, GlobalWebSocketManager.ts

---

### Mobile TypeScript Type Definitions Fix (2026-01-17)

**What**: Fixed mobile package type checking by installing missing @types/jest and @types/node packages.

**Files**: mobile/package.json, mobile/package-lock.json

---

### Workflow Settings UI Improvements (2026-01-17)

**What**: Removed "Basic Information" headline from workflow settings, added section descriptions.

**Files**: web/src/components/workflows/WorkflowForm.tsx

---

### Version Panel UX (2026-01-17)

**What**: Removed pin button from workflow versions panel, simplified UI.

**Files**: VersionListItem.tsx, VersionHistoryPanel.tsx

---

> **Format**: `Feature (date): One line. Files: x, y`
> **Limit**: 5 most recent entries. Delete oldest when adding new.

## Gotchas
- Express/Qs DoS vulnerability (CVE in GHSA-6rw7-vpxm-498p)
- Missing Content Security Policy

**Implementation**:
- Updated `dompurify` from `^3.2.3` to `^3.2.4` in web/package.json
- Updated `react-router-dom` from `^7.6.0` to `^7.12.0` in web/package.json
- Updated `react-syntax-highlighter` from `^15.6.1` to `^16.1.0` in web/package.json
- Added `overrides` for `qs`, `express`, `body-parser` in electron/package.json
- Added CSP meta tag to web/index.html

**Results**:
- Web: Reduced from 8 vulnerabilities (2 high) to 2 (1 high, 1 low)
- Electron: Reduced from 12 vulnerabilities (3 high) to 0
- All quality checks pass (typecheck, lint)

**Files Changed**:
- `web/package.json` - Dependency updates
- `electron/package.json` - Added overrides
- `web/index.html` - Added CSP meta tag

---

### TypeScript any Type Fixes in Error Handling (2026-01-12)

**What**: Improved TypeScript type safety by replacing `any` types with `unknown` in error handling across multiple stores.

**Why**: Using `any` reduces TypeScript's type checking capabilities and can mask potential runtime errors. Using `unknown` forces proper type guards and error checking.

**Implementation**:
- Updated `createErrorMessage` function to handle `unknown` type with proper type guards
- Fixed catch blocks in `SecretsStore`, `useAuth`, and `CollectionStore` to use `unknown` with proper error type guards
- Updated 7 catch blocks total to improve type safety

**Files**:
- `web/src/stores/SecretsStore.ts`
- `web/src/stores/useAuth.ts`
- `web/src/stores/CollectionStore.ts`
- `web/src/utils/errorHandling.ts`

---

_No entries yet - this memory system is new as of 2026-01-10_
### Mobile TypeScript Type Errors (2026-01-12)

**What**: Fixed mobile package TypeScript errors by updating tsconfig.json to include proper type definitions for React Native, Jest, and Node.js.

**Files**: `mobile/tsconfig.json`

### Test Expectation Fix (2026-01-12)

**What**: Fixed test expectations in `useSelectionActions.test.ts` to match actual node distribution behavior
**Files**: `web/src/hooks/__tests__/useSelectionActions.test.ts`

### Selection Action Toolbar (2026-01-10)

**What**: Added floating toolbar for batch node operations (align, distribute, group, delete) when 2+ nodes selected
**Files**: `web/src/hooks/useSelectionActions.ts`, `web/src/components/node_editor/SelectionActionToolbar.tsx`

---

## Gotchas
