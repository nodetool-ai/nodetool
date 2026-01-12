# NodeTool Project Context

## Overview

NodeTool is an open-source, privacy-first, visual AI workflow builder. Users create AI workflows by connecting nodes in a drag-and-drop interface—no coding required.

**Key Philosophy**: Visual AI workflow creation with local-first privacy and cloud flexibility.

## Architecture

### Components

1. **Web UI** (`/web`): React 18.2 + TypeScript 5.7 visual editor
   - ReactFlow-based node editor
   - Material-UI (MUI) v7 for components
   - Zustand for state management
   - TanStack Query for API calls
   - Playwright for E2E tests

2. **Electron App** (`/electron`): Desktop wrapper
   - Packages web UI for offline use
   - Manages local Python environment
   - Handles file system operations

3. **Mobile App** (`/mobile`): React Native/Expo
   - Browse and run Mini Apps
   - View workflows on mobile

4. **Backend** (separate repository):
   - Python-based API server
   - WebSocket for workflow execution
   - Not part of this repository

### Key Directories

```
/web           - React web application
/electron      - Electron desktop app
/mobile        - React Native mobile app
/docs          - Documentation
/scripts       - Build and release scripts
/.github       - CI/CD and agent instructions
```

## Design Principles

1. **Visual First**: Everything should be achievable through the visual editor
2. **Privacy First**: Run models locally when possible
3. **No Coding Required**: Users shouldn't need to write code
4. **Real-time Feedback**: Stream results as workflows execute
5. **Portable Workflows**: Same workflow runs locally or in cloud

## State Management

### Zustand Stores

The app uses Zustand stores for state management:

- **NodeStore**: Manages nodes and edges in workflows
- **WorkflowStore**: Workflow metadata and operations
- **AssetStore**: Media file management
- **SettingsStore**: User preferences
- **GlobalChatStore**: Chat interface state

**Pattern**: Stores use temporal middleware for undo/redo support.

### React Context

Some features use React Context for component-tree state:
- ThemeContext: Theme switching
- WorkflowContext: Current workflow state
- KeyboardContext: Keyboard shortcuts

## Important Patterns

### Component Structure

```typescript
// Components use functional style with TypeScript
interface MyComponentProps {
  nodeId: string;
  onSave?: (data: Data) => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ 
  nodeId, 
  onSave 
}) => {
  // Use Zustand selectors to minimize re-renders
  const node = useNodeStore(state => state.nodes[nodeId]);
  
  // Memoize callbacks
  const handleSave = useCallback(() => {
    onSave?.(data);
  }, [onSave, data]);
  
  return <Box>{/* ... */}</Box>;
};
```

### Avoiding Re-renders

```typescript
// ❌ Bad - subscribes to entire store
const store = useNodeStore();

// ✅ Good - subscribes only to needed data
const nodes = useNodeStore(state => state.nodes);
const addNode = useNodeStore(state => state.addNode);
```

### Testing Patterns

```typescript
// Use React Testing Library
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('handles user interaction', async () => {
  const user = userEvent.setup();
  const onSave = jest.fn();
  
  render(<MyComponent onSave={onSave} />);
  
  await user.click(screen.getByRole('button', { name: /save/i }));
  expect(onSave).toHaveBeenCalled();
});
```

## Data Flow

1. User creates/edits nodes in ReactFlow editor
2. Changes update Zustand stores
3. Stores persist to backend via TanStack Query
4. Workflow execution goes through WebSocket
5. Results stream back to UI in real-time

## Critical Files

- `/AGENTS.md` - Complete project documentation for AI agents
- `/.github/copilot-instructions.md` - GitHub Copilot coding patterns
- `/web/README.md` - Web app setup and development
- `/web/TESTING.md` - Comprehensive testing guide
- `/Makefile` - Build, test, lint commands

## Common Gotchas

1. **ReactFlow Types**: ReactFlow node types need explicit casting
2. **Zustand Temporal**: Undo/redo is automatic with temporal middleware
3. **MUI Theme**: Always use theme values, not hardcoded colors
4. **Strict Equality**: Use `===` not `==` (ESLint will catch this)
5. **Array Checks**: Use `Array.isArray()` not `typeof === 'object'`

## Recent Changes

> OpenCode workflows should add entries here when making significant changes

### OpenCode Branch Access Enhancement (2026-01-12)

**What**: Updated all OpenCode workflow files to fetch full git history, enabling access to all branches including main.

**Why**: OpenCode agents need to access other branches (not just the current one) to perform operations like merging main branch and resolving merge conflicts. The default shallow clone with `fetch-depth: 1` only provides access to the current branch.

**Implementation**:
- Added `fetch-depth: 0` parameter to `actions/checkout@v4` in all four OpenCode workflows
- This fetches complete git history for all branches and tags
- Enables agents to run `git merge origin/main` and resolve conflicts
- Allows agents to see and access any branch in the repository

**Files Changed**:
- `.github/workflows/opencode.yml` - Interactive OpenCode triggered by comments
- `.github/workflows/opencode-features.yaml` - Scheduled autonomous feature development
- `.github/workflows/opencode-hourly-test.yaml` - Scheduled quality assurance workflow
- `.github/workflows/opencode-hourly-improve.yaml` - Scheduled code quality improvement workflow

**Impact**: OpenCode agents can now:
- View all branches with `git branch -a`
- Merge changes from main branch
- Resolve merge conflicts automatically
- Check out other branches if needed
- Access full commit history for better context

---

### Test Expectation Fix (2026-01-12)

**What**: Fixed incorrect test expectations in `useSelectionActions.test.ts` for distributeHorizontal and distributeVertical functions.

**Why**: Tests expected sequential placement (140, 280) but the implementation uses equal distribution algorithm (0 + (index * span) / (count - 1)).

**Implementation**:
- Updated test expectations to match actual implementation behavior
- Horizontal with nodes at 0, 200, 400: positions become 0, 200, 400
- Vertical with nodes at 0, 200, 400: positions become 0, 200, 400

**Files Changed**:
- `web/src/hooks/__tests__/useSelectionActions.test.ts`

**Result**: All 2123 tests now pass

---

### Bundle Code Splitting (2026-01-12)

**What**: Implemented code splitting in vite.config.ts to reduce initial bundle size.

**Why**: Main bundle was 12.77 MB (3.8 MB gzipped), causing slow initial load times.

**Implementation**:
- Added manual chunking for heavy dependencies in vite.config.ts
- Split vendor libraries into separate chunks: react, mui, plotly, three, editor, pdf, waveform
- Each chunk can be cached independently and loaded on-demand

**Result**:
- Main bundle reduced from 12.77 MB to 5.74 MB (**55% reduction**)
- Gzipped size reduced from 3.8 MB to 1.7 MB (**55% reduction**)
- Heavy libraries separated: Plotly (4.7 MB), Three.js (991 kB), PDF (344 kB)

**Files Changed**:
- `web/vite.config.ts` - Added manualChunks configuration

---

### Selection Action Toolbar (2026-01-10)

**What**: Added a floating toolbar that appears when 2+ nodes are selected, providing quick access to batch operations like align, distribute, group, and delete.

**Why**: Improved user experience for workflows with many nodes by making batch operations more discoverable and accessible without memorizing keyboard shortcuts.

**Implementation**:
- Created `useSelectionActions` hook with batch operations (align left/center/right, align top/middle/bottom, distribute horizontally/vertically, delete, duplicate, group, bypass)
- Created `SelectionActionToolbar` component with MUI buttons and tooltips
- Integrated toolbar into `NodeEditor` component, visible when 2+ nodes selected
- Added 11 new keyboard shortcuts for batch operations (Shift+Arrow keys for alignment, etc.)
- Added comprehensive tests for the hook and component

**Files Changed**:
- `web/src/hooks/useSelectionActions.ts` - New hook for batch operations
- `web/src/components/node_editor/SelectionActionToolbar.tsx` - New toolbar component
- `web/src/components/node_editor/NodeEditor.tsx` - Integrated toolbar
- `web/src/hooks/useNodeEditorShortcuts.ts` - Added shortcut handlers
- `web/src/config/shortcuts.ts` - Added 11 new shortcuts
- `web/src/hooks/__tests__/useSelectionActions.test.ts` - Hook tests
- `web/src/components/node_editor/__tests__/SelectionActionToolbar.test.tsx` - Component tests

---

### Reset Zoom Shortcut (2026-01-12)

**What**: Added "Reset Zoom" keyboard shortcut (Ctrl/Cmd+0) to reset the canvas zoom to 100% default scale.

**Why**: Complements existing zoom controls (zoom in/out with mouse wheel, fit view with F key) with a standard editor pattern for resetting zoom. Users can now quickly return to the default 1:1 zoom level.

**Implementation**:
- Added new shortcut definition in `web/src/config/shortcuts.ts` with keyCombo `["Control", "0"]`
- Added shortcut handler in `web/src/hooks/useNodeEditorShortcuts.ts` that calls `reactFlow.setViewport({ x: 0, y: 0, zoom: 1 })`
- Added unit tests in `web/src/config/__tests__/shortcuts.test.ts` to verify shortcut configuration
- Added `reactFlow` to useMemo dependency array to fix lint warning

**Files Changed**:
- `web/src/config/shortcuts.ts` - Added resetZoom shortcut definition
- `web/src/hooks/useNodeEditorShortcuts.ts` - Added shortcut handler and dependency
- `web/src/config/__tests__/shortcuts.test.ts` - New test file

---

_No entries yet - this memory system is new as of 2026-01-10_
