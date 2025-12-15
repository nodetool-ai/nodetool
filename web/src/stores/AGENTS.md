# Stores Directory Guide

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web AGENTS.md](../AGENTS.md) → **Stores**

This guide helps AI agents understand the state management stores in NodeTool's web application. The application uses Zustand for state management.

## Related Documentation
- [Contexts Guide](../contexts/AGENTS.md) - React contexts that wrap stores
- [Hooks Guide](../hooks/AGENTS.md) - Hooks that access stores
- [ServerState Guide](../serverState/AGENTS.md) - TanStack Query for server state
- [Components Guide](../components/AGENTS.md) - Components using stores

---

## Core API and Types

- `ApiClient.ts`: Client for making API requests to the NodeTool backend
- `ApiTypes.ts`: TypeScript type definitions for API data structures

## Application State Stores

### UI State

- `AppHeaderStore.ts`: Manages the application header state
- `PanelStore.ts`: Controls panel visibility and dimensions
- `ContextMenuStore.ts`: Manages context menu visibility and position
- `KeyPressedStore.ts`: Tracks keyboard input state
- `StatusStore.ts`: Manages application status messages
- `NotificationStore.ts`: Handles notification system
- `SettingsStore.ts`: Application settings and preferences
- `RemoteSettingStore.ts`: Remote settings synchronization

### Assets Management

- `AssetStore.ts`: Central store for asset management
- `AssetGridStore.ts`: Controls asset grid view state
- `FileStore.ts`: Handles file operations
- `MetadataStore.ts`: Manages asset metadata

### Node and Workflow Management

- `NodeStore.ts`: Central store for node graph state
- `NodeData.ts`: Data structures for node types and properties
- `NodeMenuStore.ts`: Controls node selection menu state
- `ConnectableNodesStore.ts`: Manages node connection possibilities
- `ConnectionStore.ts`: Handles node connections and edges
- `ResultsStore.ts`: Stores node execution results
- `WorkflowRunner.ts`: Controls workflow execution

### Model Management

- `ModelStore.ts`: Manages AI model definitions and state
- `ModelDownloadStore.ts`: Handles model download operations

### Session and System State

- `SessionStateStore.ts`: Manages user session state
- `LogStore.ts`: Application logging system
- `ErrorStore.ts`: Error handling and reporting
- `UpdatesStore.ts`: Manages application updates
- `WebSocketUpdatesStore.ts`: Real-time updates via WebSockets

## Utility Functions

- `customEquality.ts`: Custom equality functions for state updates
- `formatNodeDocumentation.ts`: Formats node documentation for display
- `fuseOptions.ts`: Configuration for Fuse.js fuzzy search
- `uuidv4.ts`: UUID generation utility
- `useAuth.ts`: Authentication hooks

## ReactFlow Integration

- `graphNodeToReactFlowNode.ts`: Converts graph nodes to ReactFlow format
- `reactFlowNodeToGraphNode.ts`: Converts ReactFlow nodes to graph format
- `graphEdgeToReactFlowEdge.ts`: Converts graph edges to ReactFlow format
- `reactFlowEdgeToGraphEdge.ts`: Converts ReactFlow edges to graph format
- `workflowUpdates.ts`: Handles workflow update operations

## Store Architecture

The stores follow these design patterns:

1. **Zustand Pattern**: Each store is a Zustand store with actions and state
2. **Atomic State**: State is divided into focused domains
3. **Selectors**: Components use selectors to access only needed state
4. **Actions**: State modifications happen through defined action functions

## Store Usage Patterns

### Creating a store with Zustand

```typescript
// Example store pattern
import create from "zustand";

interface StoreState {
  // State properties
  count: number;

  // Actions
  increment: () => void;
  decrement: () => void;
}

const useCountStore = create<StoreState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 }))
}));
```

### Using a store in components

```typescript
// Example usage in a component
import React from "react";
import { useNodeStore } from "../stores/NodeStore";

const NodeComponent = () => {
  // Select only needed state
  const nodes = useNodeStore((state) => state.nodes);
  const addNode = useNodeStore((state) => state.addNode);

  // Component implementation
};
```

## Key Store Relationships

- `NodeStore` is the central store for the node editor
- `WorkflowRunner` manages the execution of workflows
- `AssetStore` handles all asset operations
- `ModelStore` manages AI model definitions and state

## Store Initialization Flow

1. Stores are initialized at application startup
2. Initial state is loaded from localStorage where applicable
3. Stores connect to API services for data fetching
4. Real-time updates are managed through WebSocket connections
