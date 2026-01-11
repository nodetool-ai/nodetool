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

### Node Annotations Feature (2026-01-11)

**What**: Added the ability to add custom annotations/notes to any node in the workflow editor. Users can now document their workflows directly within the editor.

**Why**: Workflow documentation is important for complex AI pipelines. Previously, users had no way to add notes to individual nodes. This feature enables better workflow documentation and collaboration.

**Implementation**:
- Added `annotation` field to `NodeData` type in `web/src/stores/NodeData.ts`
- Created new `AnnotationProperty` component at `web/src/components/properties/AnnotationProperty.tsx` for editing annotations in the Inspector panel
- Added visual annotation indicator (icon) to `NodeHeader` component at `web/src/components/node/NodeHeader.tsx` that shows tooltip on hover
- Integrated annotation editing into the Inspector panel at `web/src/components/Inspector.tsx`
- Extended `handleMultiPropertyChange` to use `updateNodeData` for annotation field (since it's a data field, not a property)

**Key Files**:
- `web/src/stores/NodeData.ts` - Added annotation field to type definition
- `web/src/components/properties/AnnotationProperty.tsx` - New component for annotation editing
- `web/src/components/node/NodeHeader.tsx` - Added annotation indicator with tooltip
- `web/src/components/Inspector.tsx` - Integrated AnnotationProperty into properties panel

**Features**:
- Visual indicator icon on nodes that have annotations
- Hover tooltip showing the annotation content
- Inline editing in the Inspector panel
- Multi-select support for batch annotation updates
- Keyboard shortcuts (Ctrl+Enter to save, Escape to cancel)
- Visual indicator showing annotation presence

**Testing**:
- All type checks pass (web and electron packages)
- All linting passes
- All unit and integration tests pass

---

_No entries yet - this memory system is new as of 2026-01-10_
