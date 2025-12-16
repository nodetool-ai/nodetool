# React Contexts Guide

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web AGENTS.md](../AGENTS.md) → **Contexts**

This guide helps AI agents understand the React context system in NodeTool's web application.

## Related Documentation
- [Stores Guide](../stores/AGENTS.md) - Zustand stores wrapped by contexts
- [Hooks Guide](../hooks/AGENTS.md) - Hooks for accessing contexts
- [Components Guide](../components/AGENTS.md) - Components using contexts

---

## Overview

NodeTool's web application uses React contexts to provide state management and dependency injection throughout the component tree. The contexts are designed to work closely with Zustand stores to provide efficient state management with React's context API for component accessibility.

## Context Components

### NodeContext

`NodeContext.tsx` provides access to the node graph state for a specific workflow:

```typescript
interface NodeContextValue {
  store: NodeStore;
  workflowId: string;
}
```

#### Key Functions

- `useNodes<T>(selector: (state: NodeStoreState) => T): T`
  - Hook to select and subscribe to parts of the node store state
  - Uses deep equality comparison to prevent unnecessary re-renders

- `useTemporalNodes<T>(selector: (state: TemporalState<PartializedNodeStore>) => T): T`
  - Hook to access the temporal (undo/redo) state of nodes
  - Used for implementing history features in the editor

- `NodeProvider`
  - React component that provides the node store to its children
  - Takes a workflowId prop to identify which workflow's nodes to manage
  - Shows a loading state when the workflow is being loaded

### WorkflowManagerContext

`WorkflowManagerContext.tsx` manages the overall collection of workflows in the application:

```typescript
type WorkflowManagerState = {
  nodeStores: Record<string, NodeStore>;
  currentWorkflowId: string | null;
  openWorkflows: WorkflowAttributes[];
  // ... other state properties and methods
}
```

#### Key Functions

- `useWorkflowManager<T>(selector: (state: WorkflowManagerState) => T): T`
  - Hook to select and subscribe to parts of the workflow manager state
  - Uses shallow comparison to prevent unnecessary re-renders

- `createWorkflowManagerStore(queryClient: QueryClient): WorkflowManagerStore`
  - Creates a Zustand store for workflow management
  - Sets up methods for creating, loading, and managing workflows

- `WorkflowManagerProvider`
  - React component that provides the workflow manager store to the application
  - Initializes WebSocket connections for real-time updates
  - Restores previously open workflows from localStorage

- `FetchCurrentWorkflow`
  - Component that ensures the current workflow from URL parameters is fetched and set as active

## Usage Patterns

### Accessing Node State

```tsx
import { useNodes } from '../contexts/NodeContext';

const MyComponent = () => {
  // Select only the needed state
  const nodes = useNodes(state => state.nodes);
  const edges = useNodes(state => state.edges);
  
  // Access actions from the store
  const addNode = useNodes(state => state.addNode);
  
  // Component implementation using the selected state
  return (
    <div>
      <p>Node count: {nodes.length}</p>
      <button onClick={() => addNode(/* node data */)}>Add Node</button>
    </div>
  );
};
```

### Accessing Workflow Manager State

```tsx
import { useWorkflowManager } from '../contexts/WorkflowManagerContext';

const WorkflowSelector = () => {
  // Select workflows and actions
  const openWorkflows = useWorkflowManager(state => state.openWorkflows);
  const currentWorkflowId = useWorkflowManager(state => state.currentWorkflowId);
  const setCurrentWorkflowId = useWorkflowManager(state => state.setCurrentWorkflowId);
  
  return (
    <div>
      <h3>Open Workflows</h3>
      <ul>
        {openWorkflows.map(workflow => (
          <li 
            key={workflow.id}
            className={workflow.id === currentWorkflowId ? 'active' : ''}
            onClick={() => setCurrentWorkflowId(workflow.id)}
          >
            {workflow.name}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

## Provider Hierarchy

The context providers are typically set up in this hierarchy:

```tsx
<WorkflowManagerProvider queryClient={queryClient}>
  <FetchCurrentWorkflow>
    <NodeProvider workflowId={currentWorkflowId}>
      {/* Application components that need access to workflow and node state */}
    </NodeProvider>
  </FetchCurrentWorkflow>
</WorkflowManagerProvider>
```

## Context-Store Integration

NodeTool's contexts are designed to work with Zustand stores:

1. Each context wraps a Zustand store
2. The context provides the store to the React component tree
3. Custom hooks (`useNodes`, `useWorkflowManager`) provide type-safe access to the stores
4. Equality functions (shallow/deep) are used to optimize re-renders

This approach combines:
- The familiarity of React's context API
- The performance and simplicity of Zustand stores
- Type safety through TypeScript