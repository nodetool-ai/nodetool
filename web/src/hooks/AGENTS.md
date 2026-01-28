# Custom Hooks Guide

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web AGENTS.md](../AGENTS.md) → **Hooks**

This guide helps AI agents understand and work with custom React hooks in the NodeTool web application.

## Overview

The hooks directory contains reusable React hooks organized by functionality. Hooks follow React's naming convention (prefix with `use`) and provide encapsulated, composable logic for components.

## Directory Structure

```
/hooks
├── /assets           # Asset management hooks
├── /browser          # Browser API hooks (audio, IPC, etc.)
├── /contextmenus     # Context menu interaction hooks
├── /editor           # Editor-specific hooks
├── /handlers         # Event handler hooks
├── /nodes            # Node manipulation hooks
└── *.ts              # Root-level utility hooks
```

## Hook Categories

### 1. Node Editor & Workflow Hooks

**Location**: Root level and `/nodes`, `/editor` subdirectories

#### Core Node Manipulation
- **`useNodeEditorShortcuts.ts`**: Comprehensive keyboard shortcuts for the editor
  - Handles copy, paste, delete, align, duplicate, zoom, save operations
  - Integrates with `KeyPressedStore` and `config/shortcuts.ts`
  - Uses React Router for navigation

- **`useNodeFocus.ts`**: Keyboard navigation for nodes
  - Tab-based sequential navigation between nodes
  - Alt+Arrow keys for directional navigation
  - History tracking for "go back" functionality
  - Visual focus indicator on focused nodes

- **`useSelectionActions.ts`**: Batch operations for selected nodes
  - Alignment: Left, Center, Right, Top, Middle, Bottom
  - Distribution: Horizontal and vertical spacing
  - Operations: Delete, Duplicate, Group, Bypass
  - Integrates with `SelectionActionToolbar` component

- **`useCreateNode.ts`**: Factory hook for creating nodes
  - Generates proper node IDs and positions
  - Integrates with metadata store for node types

- **`useAlignNodes.ts`**: Node alignment and grid snapping
  - Align left, right, center, top, bottom, distribute
  - Grid snapping from `SettingsStore`

- **`useDuplicate.ts`**: Node and edge duplication
  - Generates new IDs for duplicated nodes
  - Preserves relative positions
  - Handles horizontal/vertical offset

- **`useFocusPan.ts`**: Camera focus and panning
  - Smooth transitions to specific nodes
  - Viewport centering
  - Auto-pan when nodes receive keyboard focus

- **`useFitView.ts`**, **`useFitNodeEvent.ts`**: Viewport fitting
  - Auto-fit selected nodes or entire graph
  - Configurable padding and transitions
  - Supports zoom presets (25%, 50%, 75%, 100%, 150%, 200%)

- **`useProcessedEdges.ts`**: Edge processing and validation
  - Validates connections based on type compatibility
  - Processes edge animations and styles

#### Workflow Management
- **`useWorkflowGraphUpdater.ts`**: Syncs workflow updates from GlobalChatStore
  - Listens for AI agent workflow modifications
  - Converts backend graph to ReactFlow nodes/edges
  - Triggers auto-layout after updates

- **`useWorkflowActions.ts`**: Workflow operations for UI
  - Create, open, delete workflows
  - Template selection and instantiation

- **`useDashboardData.ts`**: Dashboard data fetching
  - Loads workflows, templates, recent chats
  - Sorts and filters for display

### 2. Asset Management Hooks

**Location**: `/assets` subdirectory

- **`useAssetUpload.ts`** (in serverState): Asset upload with progress tracking
- **`useCopyPaste.tsx`** (in handlers): Copy/paste for nodes and edges
- **`useFileDrop.ts`** (in handlers): File drag-and-drop with validation
- **`useDropHandler.ts`** (in handlers): Dropping files onto canvas
- **`addNodeFromAsset`**: Creates appropriate nodes from uploaded assets

### 3. Model Management Hooks

**Location**: Root level

- **`useHuggingFaceModels.ts`**: Fetches HuggingFace model data
  - Uses React Query with proper cache keys
  - Returns model list with metadata

- **`useLoraModels.ts`**: LoRA model management
  - Fetches LoRA-specific models
  - Filters by compatibility

- **`useOllamaModels.ts`**: Ollama model integration
  - Local model management
  - Cache directory information

- **`useRecommendedModels.ts`**: Curated model recommendations
  - Filters by use case (text, image, audio)
  - Provides model metadata for selection

- **`useRecommendedTaskModels.ts`**: Task-specific model recommendations
  - Returns models suitable for specific tasks
  - Integrates with node metadata

- **`useModelsByProvider.ts`**: Models organized by provider
  - Groups models by source (HuggingFace, Ollama, OpenAI, etc.)
  - Handles provider-specific configuration

### 4. UI Interaction Hooks

**Location**: Root level

- **`useNumberInput.ts`**: Advanced number input
  - Drag-to-change functionality
  - Min/max constraints
  - Decimal precision control
  - Step increments

- **`useDelayedHover.ts`**: Delayed hover for tooltips
  - Configurable delay
  - Prevents tooltip flicker
  - Returns mouse event handlers

- **`useCollectionDragAndDrop.ts`**: Drag-and-drop for collections
  - Asset collection management
  - Reordering and organization

- **`useRenderLogger.tsx`**: Debug re-render tracking (development only)
  - Logs component re-render causes
  - Helps identify performance issues

### 5. Browser & Hardware Hooks

**Location**: `/browser` subdirectory

- **`useWaveRecorder.ts`**: Audio recording with Web Audio API
  - Real-time audio capture
  - Waveform visualization
  - Used in audio input nodes

- **`useIpcRenderer.ts`**: Electron IPC communication
  - Desktop app integration
  - OS-level features
  - Menu and window management

- **`useInputStream.ts`**: Streaming input management
  - Handles streaming data to workflow nodes
  - Audio/video stream coordination

- **`useRealtimeAudioStream.ts`**: Real-time audio streaming
  - WebSocket audio streaming
  - Low-latency audio transmission

### 6. Chat & Communication Hooks

**Location**: Root level

- **`useChatService.ts`**: Global chat integration
  - Combines GlobalChatStore operations
  - Thread management
  - Message sending and receiving
  - Planning and task updates

- **`useEnsureChatConnected.ts`**: WebSocket connection management
  - Ensures chat connection while UI is active
  - Handles reconnection logic

- **`useJobReconnection.ts`**: Workflow job reconnection
  - Reconnects to running jobs on app load
  - Restores execution state

- **`useRunningJobs.ts`**: Running job tracking
  - Lists currently executing workflows
  - Job status and progress

### 7. Provider & API Hooks

**Location**: Root level

- **`useProviders.ts`**: Provider list management
  - Fetches available AI providers
  - Provider configuration

- **`useProviderApiKeyValidation.ts`**: API key validation by provider
  - Validates provider-specific API keys
  - Returns validation status

- **`useApiKeyValidation.ts`**: Generic API key validation
  - Checks key format and validity

- **`useSecrets.ts`**: Secrets management
  - Secure storage of API keys
  - Integration with settings store

### 8. Utility Hooks

**Location**: Root level

- **`useNamespaceTree.ts`**: Hierarchical namespace management
  - Organizes nodes by namespace
  - Tree structure for node menu

- **`useIsDarkMode.ts`**: Theme detection
  - Media query for system dark mode
  - Integrates with settings store

## Hook Patterns

### 1. React Query Hooks

For server data fetching:

```typescript
// ✅ Good pattern
export const useHuggingFaceModels = () => {
  return useQuery({
    queryKey: ['models', 'huggingface'],
    queryFn: async () => {
      const response = await ApiClient.get('/api/models/huggingface');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Usage in component
const MyComponent = () => {
  const { data: models, isLoading, error } = useHuggingFaceModels();
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return <ModelList models={models} />;
};
```

### 2. Store-Based Hooks

For accessing Zustand stores:

```typescript
// ✅ Good pattern - selective subscription
export const useNodeSelection = () => {
  const selectedNodes = useNodeStore(
    state => state.nodes.filter(n => n.selected)
  );
  const selectNode = useNodeStore(state => state.selectNode);
  
  return { selectedNodes, selectNode };
};

// ❌ Bad pattern - subscribes to entire store
export const useNodeSelection = () => {
  const store = useNodeStore();
  return {
    selectedNodes: store.nodes.filter(n => n.selected),
    selectNode: store.selectNode
  };
};
```

### 3. Event Handler Hooks

For complex event handling:

```typescript
// ✅ Good pattern
export const useFileDrop = (options: FileDropOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  const onDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    // Process files...
  }, [options]);
  
  return { onDragOver, onDragLeave, onDrop, isDragging, uploadProgress };
};
```

### 4. Effect-Based Hooks

For side effects and subscriptions:

```typescript
// ✅ Good pattern
export const useWorkflowGraphUpdater = () => {
  const lastUpdate = useGlobalChatStore(state => state.lastWorkflowGraphUpdate);
  const { getCurrentWorkflow } = useWorkflowManager(state => ({
    getCurrentWorkflow: state.getCurrentWorkflow
  }));
  
  useEffect(() => {
    if (!lastUpdate) return;
    
    const workflow = getCurrentWorkflow();
    if (!workflow || workflow.id !== lastUpdate.workflow_id) return;
    
    // Apply graph updates
    // ...
    
  }, [lastUpdate, getCurrentWorkflow]);
};
```

## Testing Hooks

### Test Location
Place hook tests in `__tests__` subdirectories:
- `/hooks/__tests__/useMyHook.test.ts`
- `/hooks/assets/__tests__/useAssetUpload.test.ts`

### Testing Pattern

```typescript
import { renderHook, act } from '@testing-library/react';
import { useNodeSelection } from '../useNodeSelection';

describe('useNodeSelection', () => {
  it('should select and deselect nodes', () => {
    const { result } = renderHook(() => useNodeSelection());
    
    expect(result.current.selectedNodes).toEqual([]);
    
    act(() => {
      result.current.selectNode('node-1');
    });
    
    expect(result.current.selectedNodes).toHaveLength(1);
  });
});
```

## Best Practices

### 1. Hook Naming
- Always prefix with `use`
- Use descriptive names: `useWorkflowActions` not `useActions`
- Match domain: `useHuggingFaceModels` for HF-specific logic

### 2. Dependencies
- Always include all dependencies in `useEffect`, `useCallback`, `useMemo` arrays
- Use ESLint `exhaustive-deps` rule
- Extract stable references when needed

### 3. Return Values
- Use object destructuring for multiple return values
- Provide TypeScript types for all returns
- Keep return interface stable across renders

### 4. Performance
- Use `useCallback` for event handlers passed to children
- Use `useMemo` for expensive calculations
- Use selective store subscriptions
- Avoid creating objects in render

### 5. Error Handling
- Handle loading and error states in data-fetching hooks
- Provide meaningful error messages
- Use try-catch in async operations

---

## React Hook Usage Rules

These rules govern when to use React hooks and memoization. Follow them to avoid unnecessary complexity.

### useEffect

**Use when:**
- You need to synchronize React with the outside world
- Side effects: network requests, subscriptions, timers, DOM mutations, logging
- Something must run after render

**Do not use when:**
- You only derive data from props or state
- You want to "react" to state changes inside render logic
- You try to fix re-render performance

**Rules:**
- Effects are for effects, not data flow
- If you can compute it during render, do it there
- Every value used inside must be in the dependency array or intentionally stable

**Pattern:**
```typescript
useEffect(() => {
  fetchData(id);
}, [id]);
```

**Smell (avoid):**
```typescript
// ❌ Bad - should be plain: const value = a + b
useEffect(() => setValue(a + b), [a, b]);
```

---

### useMemo

**Use when:**
- Computation is expensive
- Result is reused across renders
- Referential stability matters for child props or dependency arrays

**Do not use when:**
- Computation is cheap
- You are trying to prevent re-renders
- You are guessing about performance

**Rule:** `useMemo` caches values, not renders.

**Pattern:**
```typescript
const filtered = useMemo(() => heavyFilter(data), [data]);
```

**Smell (avoid):**
```typescript
// ❌ Bad - pointless memoization
const sum = useMemo(() => a + b, [a, b]);
```

---

### useCallback

**Use when:**
- Passing functions to memoized children (wrapped in `React.memo`)
- Function is a dependency of `useEffect` or `useMemo`
- You need stable function identity for other reasons

**Do not use when:**
- Function is only used locally
- Child component is not memoized
- You are trying to speed things up blindly

**Rule:** `useCallback` is just `useMemo` for functions.

**Pattern:**
```typescript
// Child component is memoized, so stable callback prevents re-renders
const onClick = useCallback(() => {
  doSomething(id);
}, [id]);

// Pass to memoized child
<MemoizedButton onClick={onClick} />
```

**Smell (avoid):**
```typescript
// ❌ Bad - unnecessary unless passed to memoized child
const onClick = useCallback(() => setOpen(true), []);

// If the child is not memoized, just use a regular function:
const onClick = () => setOpen(true);
```

---

### React.memo

**Use when:**
- Component is pure (same props → same output)
- It receives stable props
- It renders often
- Rendering is expensive

**Do not use when:**
- Props change every render (breaks memoization)
- Component is small or cheap to render
- You need internal state updates to trigger render

**Rule:** Memoization only works if props are referentially stable.

**Pattern:**
```typescript
const Item = React.memo(function Item({ data, onSelect }) {
  // ...
});
```

**Smell (avoid):**
```typescript
// ❌ Bad - new object every render breaks memo
<Item data={{ x: 1 }} />

// ✅ Good - stable reference
const data = useMemo(() => ({ x: 1 }), []);
<Item data={data} />
```

---

### Combined Rules Summary

| Hook | Purpose |
|------|---------|
| `useEffect` | External world (side effects) |
| `useMemo` | Expensive value computation |
| `useCallback` | Stable function identity |
| `React.memo` | Stable component identity |

**Never:**
- Add these "just in case"
- Add them without measuring or clear reasoning
- Use them to patch design problems

**If performance is fine:** Do nothing.

## Common Patterns in NodeTool

### Creating Nodes from Hooks

```typescript
const createNode = useNodeStore(state => state.addNode);
const generateId = useNodeStore(state => state.generateNodeId);

const handleAddNode = useCallback((type: string) => {
  const id = generateId();
  createNode({
    id,
    type,
    position: { x: 100, y: 100 },
    data: {
      properties: {},
      workflow_id: workflowId
    }
  });
}, [createNode, generateId, workflowId]);
```

### Keyboard Shortcuts

```typescript
// From useNodeEditorShortcuts.ts
const shortcuts = useKeyPressedStore(state => state.shortcuts);

useEffect(() => {
  const unsubscribe = shortcuts.register({
    key: 'KeyS',
    ctrl: true,
    callback: () => saveWorkflow()
  });
  
  return unsubscribe;
}, [shortcuts, saveWorkflow]);
```

### WebSocket Integration

```typescript
// From useChatService.ts
const sendMessage = useGlobalChatStore(state => state.sendMessage);
const status = useGlobalChatStore(state => state.status);

const handleSend = useCallback(async (text: string) => {
  if (status !== 'connected') {
    await connect();
  }
  await sendMessage(text);
}, [sendMessage, status, connect]);
```

## Related Documentation

- [Components Guide](../components/AGENTS.md) - Using hooks in components
- [Stores Guide](../stores/AGENTS.md) - Zustand store integration
- [ServerState Guide](../serverState/AGENTS.md) - React Query patterns
- [Root AGENTS.md](../../../AGENTS.md) - Project overview

## Quick Reference

### Most Used Hooks
1. `useNodeStore` - Node graph state (from stores)
2. `useWorkflowManager` - Workflow management (from contexts)
3. `useQuery` - Data fetching (TanStack Query)
4. `useNodeEditorShortcuts` - Keyboard shortcuts
5. `useAssetUpload` - File uploads

### Hook Categories by Use Case
- **Building UI**: `useNumberInput`, `useDelayedHover`, `useRenderLogger`
- **Node Operations**: `useCreateNode`, `useAlignNodes`, `useDuplicate`, `useFocusPan`
- **Data Fetching**: `useHuggingFaceModels`, `useAssets`, `useWorkflow`
- **File Handling**: `useFileDrop`, `useAssetUpload`, `useDropHandler`
- **Execution**: `useWorkflowRunner`, `useRunningJobs`, `useJobReconnection`

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
