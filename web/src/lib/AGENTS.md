# Library Integrations Guide

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web AGENTS.md](../AGENTS.md) → **Lib**

This guide helps AI agents understand third-party library integrations and specialized utilities in the NodeTool web application.

## Overview

The `lib` directory contains integrations with external libraries, specialized utilities, and custom implementations that don't fit into standard categories.

## Directory Structure

```
/lib
├── /tools                  # Frontend tool registry and built-in tools
│   ├── frontendTools.ts    # Tool registry and execution
│   └── /builtin            # Built-in tool implementations
├── /websocket              # WebSocket management
│   ├── GlobalWebSocketManager.ts
│   └── WebSocketManager.ts
└── supabaseClient.ts       # Supabase authentication client
```

## Frontend Tools System

### frontendTools.ts

The frontend tools registry allows the backend AI agent to call UI functions:

```typescript
// Tool definition interface
interface FrontendTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (params: any, state: FrontendToolState) => Promise<any>;
}

// Tool registry
class FrontendToolRegistry {
  private tools = new Map<string, FrontendTool>();
  
  register(tool: FrontendTool): void {
    this.tools.set(tool.name, tool);
  }
  
  async execute(name: string, params: any, state: FrontendToolState): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.execute(params, state);
  }
  
  getTools(): FrontendTool[] {
    return Array.from(this.tools.values());
  }
}

// Singleton instance
export const frontendToolRegistry = new FrontendToolRegistry();

// Frontend tool state (provided by stores and contexts)
export interface FrontendToolState {
  // Workflow operations
  getWorkflow: (id: string) => Promise<Workflow>;
  createNew: () => Promise<Workflow>;
  saveWorkflow: (workflow: Workflow) => Promise<void>;
  
  // Node operations
  getNodes: () => Node[];
  addNode: (node: Partial<Node>) => void;
  updateNode: (id: string, data: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  
  // UI operations
  fitView: () => void;
  selectNodes: (ids: string[]) => void;
}
```

### Built-in Tools

All tools in `/builtin` follow this pattern:

#### addNode.ts

```typescript
import { frontendToolRegistry } from '../frontendTools';

frontendToolRegistry.register({
  name: 'ui_add_node',
  description: 'Add a node to the workflow',
  parameters: {
    type: 'object',
    properties: {
      node_type: {
        type: 'string',
        description: 'The type of node to add (e.g., "comfy.sd.StableDiffusion")'
      },
      position: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' }
        }
      },
      properties: {
        type: 'object',
        description: 'Node properties/configuration'
      }
    },
    required: ['node_type']
  },
  execute: async (params, state) => {
    const { node_type, position, properties } = params;
    
    const node = {
      id: generateId(),
      type: node_type,
      position: position || { x: 100, y: 100 },
      data: {
        properties: properties || {},
        workflow_id: state.workflowId
      }
    };
    
    state.addNode(node);
    return { node_id: node.id };
  }
});
```

#### updateNodeData.ts

```typescript
frontendToolRegistry.register({
  name: 'ui_update_node_data',
  description: 'Update node properties',
  parameters: {
    type: 'object',
    properties: {
      node_id: { type: 'string' },
      properties: {
        type: 'object',
        description: 'Properties to update'
      }
    },
    required: ['node_id', 'properties']
  },
  execute: async (params, state) => {
    const { node_id, properties } = params;
    state.updateNode(node_id, {
      data: {
        properties: {
          ...state.getNodes().find(n => n.id === node_id)?.data.properties,
          ...properties
        }
      }
    });
    return { success: true };
  }
});
```

#### connectNodes.ts

```typescript
frontendToolRegistry.register({
  name: 'ui_connect_nodes',
  description: 'Create an edge between two nodes',
  parameters: {
    type: 'object',
    properties: {
      source_node_id: { type: 'string' },
      source_handle: { type: 'string', default: 'output' },
      target_node_id: { type: 'string' },
      target_handle: { type: 'string', default: 'input' }
    },
    required: ['source_node_id', 'target_node_id']
  },
  execute: async (params, state) => {
    const { source_node_id, source_handle, target_node_id, target_handle } = params;
    
    state.addEdge({
      id: `${source_node_id}-${target_node_id}`,
      source: source_node_id,
      target: target_node_id,
      sourceHandle: source_handle || 'output',
      targetHandle: target_handle || 'input'
    });
    
    return { success: true };
  }
});
```

#### alignNodes.ts

```typescript
frontendToolRegistry.register({
  name: 'ui_align_nodes',
  description: 'Align selected nodes',
  parameters: {
    type: 'object',
    properties: {
      node_ids: {
        type: 'array',
        items: { type: 'string' }
      },
      alignment: {
        type: 'string',
        enum: ['left', 'right', 'top', 'bottom', 'center-horizontal', 'center-vertical']
      }
    },
    required: ['node_ids', 'alignment']
  },
  execute: async (params, state) => {
    const { node_ids, alignment } = params;
    // Implementation uses useAlignNodes logic
    state.alignNodes(node_ids, alignment);
    return { success: true };
  }
});
```

#### autoLayout.ts

```typescript
frontendToolRegistry.register({
  name: 'ui_auto_layout',
  description: 'Automatically layout the workflow graph',
  parameters: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        enum: ['TB', 'LR'],
        default: 'TB',
        description: 'Layout direction: TB (top-bottom) or LR (left-right)'
      }
    }
  },
  execute: async (params, state) => {
    await state.autoLayout(params.direction || 'TB');
    return { success: true };
  }
});
```

#### workflow.ts

```typescript
// Create new workflow
frontendToolRegistry.register({
  name: 'ui_create_workflow',
  description: 'Create a new workflow',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' }
    },
    required: ['name']
  },
  execute: async (params, state) => {
    const workflow = await state.createNew();
    workflow.name = params.name;
    workflow.description = params.description;
    await state.saveWorkflow(workflow);
    return { workflow_id: workflow.id };
  }
});

// Save workflow
frontendToolRegistry.register({
  name: 'ui_save_workflow',
  description: 'Save the current workflow',
  parameters: {
    type: 'object',
    properties: {}
  },
  execute: async (params, state) => {
    const workflow = await state.getCurrentWorkflow();
    await state.saveWorkflow(workflow);
    return { success: true };
  }
});
```

#### Other Built-in Tools

- **deleteNode.ts**: Remove node from workflow
- **deleteEdge.ts**: Remove edge/connection
- **selectNodes.ts**: Change node selection
- **moveNode.ts**: Change node position
- **fitView.ts**: Fit graph to viewport
- **setNodeColor.ts**: Change node appearance
- **setNodeTitle.ts**: Update node title
- **duplicateNode.ts**: Clone a node
- **setAutoLayout.ts**: Enable/disable auto-layout
- **setNodeSyncMode.ts**: Configure node sync behavior
- **setSelectionMode.ts**: Change selection mode
- **graph.ts**: Graph-level operations

## WebSocket Management

### WebSocketManager.ts

Generic WebSocket wrapper with auto-reconnect:

```typescript
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners = new Map<string, Set<Function>>();
  
  constructor(private url: string) {}
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emit('open');
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.emit('message', message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        this.emit('error', error);
        reject(error);
      };
      
      this.ws.onclose = () => {
        this.emit('close');
        this.attemptReconnect();
      };
    });
  }
  
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket is not connected');
    }
  }
  
  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }
  
  private emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnecting', { attempts: this.reconnectAttempts });
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect will be attempted again
      });
    }, delay);
  }
  
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// Usage
const ws = new WebSocketManager('ws://localhost:8000/ws');

ws.on('open', () => console.log('Connected'));
ws.on('message', (msg) => console.log('Received:', msg));
ws.on('error', (err) => console.error('Error:', err));
ws.on('close', () => console.log('Disconnected'));

await ws.connect();
ws.send({ type: 'subscribe', channel: 'updates' });
```

### GlobalWebSocketManager.ts

Singleton for workflow execution WebSocket:

```typescript
class GlobalWebSocketManager {
  private static instance: GlobalWebSocketManager;
  private ws: WebSocketManager | null = null;
  private isConnecting = false;
  private subscriptions = new Map<string, Set<Function>>();
  
  private constructor() {}
  
  static getInstance(): GlobalWebSocketManager {
    if (!GlobalWebSocketManager.instance) {
      GlobalWebSocketManager.instance = new GlobalWebSocketManager();
    }
    return GlobalWebSocketManager.instance;
  }
  
  async ensureConnection(): Promise<void> {
    if (this.ws) return;
    
    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (this.ws || !this.isConnecting) {
            clearInterval(check);
            resolve(undefined);
          }
        }, 100);
      });
      return;
    }
    
    this.isConnecting = true;
    try {
      this.ws = new WebSocketManager(WORKER_URL);
      await this.ws.connect();
      
      // Set up message routing
      this.ws.on('message', (message) => {
        this.routeMessage(message);
      });
    } finally {
      this.isConnecting = false;
    }
  }
  
  subscribe(key: string, handler: Function): () => void {
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)!.add(handler);
    
    return () => {
      this.subscriptions.get(key)?.delete(handler);
    };
  }
  
  send(message: any): void {
    this.ws?.send(message);
  }
  
  private routeMessage(message: any): void {
    // Route to appropriate subscribers
    const key = message.workflow_id || message.job_id;
    if (key) {
      this.subscriptions.get(key)?.forEach(handler => handler(message));
    }
  }
  
  disconnect(): void {
    this.ws?.disconnect();
    this.ws = null;
  }
}

export const globalWebSocketManager = GlobalWebSocketManager.getInstance();

// Usage in WorkflowRunner
const unsubscribe = globalWebSocketManager.subscribe(
  workflowId,
  handleMessage
);

globalWebSocketManager.send({
  type: 'run_job',
  workflow_id: workflowId,
  graph: { nodes, edges }
});
```

## Supabase Integration

### supabaseClient.ts

Authentication and database client:

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'local-key';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Authentication helpers
export const signInWithGoogle = () => {
  return supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
};

export const signOut = () => {
  return supabaseClient.auth.signOut();
};

export const getSession = () => {
  return supabaseClient.auth.getSession();
};

// Listen for auth changes
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('User signed in:', session?.user);
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  }
});

// Usage in useAuth store
import { supabaseClient, getSession } from '../lib/supabaseClient';

export const useAuth = create<AuthState>((set) => ({
  session: null,
  user: null,
  
  initialize: async () => {
    const { data } = await getSession();
    set({
      session: data.session,
      user: data.session?.user || null
    });
  },
  
  signIn: async (provider: 'google' | 'github') => {
    await supabaseClient.auth.signInWithOAuth({ provider });
  },
  
  signOut: async () => {
    await supabaseClient.auth.signOut();
    set({ session: null, user: null });
  }
}));
```

## Best Practices

### 1. Frontend Tools

**Tool Naming**:
- Prefix with `ui_` to distinguish from backend tools
- Use descriptive names: `ui_add_node` not `ui_add`

**Parameters**:
- Use JSON Schema for validation
- Provide descriptions for all parameters
- Mark required vs optional parameters

**Error Handling**:
```typescript
execute: async (params, state) => {
  try {
    // Tool implementation
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
```

### 2. WebSocket Management

**Connection Lifecycle**:
```typescript
// Connect once, reuse connection
await globalWebSocketManager.ensureConnection();

// Subscribe to updates
const unsubscribe = globalWebSocketManager.subscribe(id, handler);

// Clean up
useEffect(() => {
  return () => unsubscribe();
}, [id]);
```

**Message Handling**:
```typescript
// Always validate messages
const handleMessage = (message: any) => {
  if (!message.type) {
    console.warn('Invalid message:', message);
    return;
  }
  
  switch (message.type) {
    case 'update':
      processUpdate(message);
      break;
    // ...
  }
};
```

### 3. Supabase Integration

**Session Management**:
```typescript
// Check session before API calls
const session = await supabaseClient.auth.getSession();
if (!session) {
  // Redirect to login
  return;
}

// Include session token in requests
const token = session.access_token;
```

**Error Handling**:
```typescript
const { data, error } = await supabaseClient
  .from('workflows')
  .select('*');

if (error) {
  console.error('Database error:', error);
  return;
}
```

## Related Documentation

- [Hooks Guide](../hooks/AGENTS.md) - Custom React hooks
- [Stores Guide](../stores/AGENTS.md) - State management
- [Components Guide](../components/AGENTS.md) - UI components
- [Root AGENTS.md](../../../AGENTS.md) - Project overview

## Quick Reference

### Frontend Tools Registration
```typescript
import { frontendToolRegistry } from './frontendTools';

frontendToolRegistry.register({
  name: 'ui_my_tool',
  description: 'Tool description',
  parameters: { /* JSON Schema */ },
  execute: async (params, state) => { /* implementation */ }
});
```

### WebSocket Usage
```typescript
const ws = new WebSocketManager(url);
await ws.connect();
ws.on('message', handleMessage);
ws.send({ type: 'command', data: {} });
```

### Supabase Auth
```typescript
await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
const { data } = await supabaseClient.auth.getSession();
await supabaseClient.auth.signOut();
```

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
