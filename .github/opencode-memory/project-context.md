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

### Node Annotations (2026-01-12)

**What**: Added ability to add custom notes/annotations to any node in the workflow editor.

**Why**: Users need a way to document their workflows, explain complex node configurations, and add context to specific nodes for themselves and team members.

**Implementation**:
- Added `annotation` field to `NodeData` type in `web/src/stores/NodeData.ts`
- Created `AnnotationDialog` component for editing annotations (`web/src/components/dialogs/AnnotationDialog.tsx`)
- Created `AnnotationDialogStore` for managing dialog state (`web/src/stores/AnnotationDialogStore.ts`)
- Added `handleToggleAnnotation` handler to `useNodeContextMenu` hook
- Added annotation menu item to `NodeContextMenu` component
- Added visual annotation indicator to `BaseNode` component (yellow icon at bottom-right)
- Integrated annotation dialog into `ContextMenus` component
- Added comprehensive unit tests for the annotation feature

**Files Changed**:
- `web/src/stores/NodeData.ts` - Added annotation field to NodeData type
- `web/src/stores/AnnotationDialogStore.ts` - New store for annotation dialog state
- `web/src/components/dialogs/AnnotationDialog.tsx` - New dialog component
- `web/src/components/context_menus/NodeContextMenu.tsx` - Added annotation menu option
- `web/src/components/context_menus/ContextMenus.tsx` - Integrated annotation dialog
- `web/src/components/node/BaseNode.tsx` - Added visual annotation indicator
- `web/src/hooks/nodes/useNodeContextMenu.ts` - Added annotation handler
- `web/src/hooks/nodes/__tests__/useNodeContextMenu.test.ts` - Added annotation tests

**Usage**:
1. Right-click on any node to open the context menu
2. Select "Add Note" to create a new annotation
3. Select "Edit Note" to modify an existing annotation
4. Hover over the yellow note icon to see the annotation tooltip
5. Clear the annotation field and save to remove the note

---

_No entries yet - this memory system is new as of 2026-01-10_
