# ComfyUI Integration Implementation

## Overview

This document describes the ComfyUI integration implementation in NodeTool. The integration allows NodeTool to load, edit, and execute ComfyUI workflows as native NodeTool graphs, following a "direct graph representation" approach with no encapsulation layer.

## Architecture

### Core Principles

1. **Direct Graph Representation**: ComfyUI nodes appear as regular nodes on the NodeTool canvas
2. **No Encapsulation**: Workflows are represented directly, not wrapped in subgraphs
3. **Dynamic Schema Loading**: Node definitions fetched from live ComfyUI backend
4. **Execution Delegation**: Workflows route to ComfyUI backend for execution
5. **Perfect Fidelity**: Original ComfyUI metadata and structure preserved

## Components

### 1. ComfyUI Service (`web/src/services/ComfyUIService.ts`)

**Purpose**: Communication layer with ComfyUI backend

**Key Features**:
- Fetch node definitions from `/object_info` endpoint
- Submit workflows to `/prompt` endpoint
- WebSocket connection for real-time progress
- Connection health checking
- Schema caching

**Example Usage**:
```typescript
import { getComfyUIService } from '../services/ComfyUIService';

const service = getComfyUIService();
service.setBaseUrl('http://127.0.0.1:8188');

// Check connection
const connected = await service.checkConnection();

// Fetch node definitions
const objectInfo = await service.fetchObjectInfo();

// Submit workflow for execution
const response = await service.submitPrompt(prompt);
```

### 2. ComfyUI Store (`web/src/stores/ComfyUIStore.ts`)

**Purpose**: Zustand store for connection state management

**State**:
- `baseUrl`: ComfyUI backend URL
- `isConnected`: Connection status
- `objectInfo`: Cached node schemas
- `currentPromptId`: Active execution ID
- `isExecuting`: Execution status

**Example Usage**:
```typescript
import { useComfyUIStore } from '../stores/ComfyUIStore';

const {
  isConnected,
  connect,
  disconnect,
  fetchObjectInfo
} = useComfyUIStore();

// Connect to backend
await connect();

// Fetch schemas
await fetchObjectInfo();
```

### 3. Workflow Converter (`web/src/utils/comfyWorkflowConverter.ts`)

**Purpose**: Bidirectional conversion between ComfyUI and NodeTool formats

**Key Functions**:

```typescript
// ComfyUI → NodeTool
const graph = comfyWorkflowToNodeToolGraph(comfyWorkflow);

// NodeTool → ComfyUI
const workflow = nodeToolGraphToComfyWorkflow(graph);

// NodeTool → ComfyUI Prompt (for execution)
const prompt = nodeToolGraphToComfyPrompt(graph);

// Utility functions
const isComfyNode = isComfyUINode(nodeType);
const hasComfyNodes = graphHasComfyUINodes(graph);
```

**Conversion Mapping**:
```
ComfyUI Node → NodeTool Node
- id (number) → id (string)
- type → type ("comfy." prefix added)
- pos [x,y] → ui_properties.position {x,y}
- size [w,h] → ui_properties.size {width,height}
- properties → data (with metadata preservation)
- widgets_values → data._comfy_widgets

ComfyUI Link → NodeTool Edge
- origin_id → source
- target_id → target
- origin_slot → sourceHandle ("output_N")
- target_slot → targetHandle (actual input name)
```

### 4. Schema Converter (`web/src/utils/comfySchemaConverter.ts`)

**Purpose**: Convert ComfyUI node schemas to NodeTool metadata

**Key Functions**:

```typescript
// Convert single schema
const metadata = comfySchemaToNodeMetadata(nodeName, schema);

// Convert all schemas
const metadataMap = comfyObjectInfoToMetadataMap(objectInfo);
```

**Type Mapping**:
```
ComfyUI Type → NodeTool Type
- INT → int
- FLOAT → float
- STRING → str
- BOOLEAN → bool
- IMAGE → comfy.image_tensor
- LATENT → comfy.latent
- VAE → comfy.vae
- CLIP → comfy.clip
- CONDITIONING → comfy.conditioning
- MODEL → comfy.unet
- CONTROL_NET → comfy.control_net
- SAMPLER → comfy.sampler
- SIGMAS → comfy.sigmas
- MASK → comfy.mask
- etc.
```

### 5. ComfyUI Executor (`web/src/utils/comfyExecutor.ts`)

**Purpose**: Route workflow execution to ComfyUI backend

**Key Functions**:

```typescript
// Check if should use ComfyUI
const useComfy = shouldUseComfyUIExecution(graph);

// Execute via ComfyUI
const result = await executeViaComfyUI(graph, onProgress);

// Cancel execution
await cancelComfyUIExecution(promptId);
```

### 6. Node Registration Hook (`web/src/hooks/comfy/useComfyUINodes.ts`)

**Purpose**: Automatically load and register ComfyUI nodes

**Usage**:
```typescript
import { useComfyUINodes } from '../hooks/comfy/useComfyUINodes';

function App() {
  const { loadComfyUINodes, isLoaded } = useComfyUINodes();
  
  // Nodes are loaded automatically when connected
  // Can also manually trigger: await loadComfyUINodes();
}
```

### 7. Settings UI (`web/src/components/menus/ComfyUISettings.tsx`)

**Purpose**: User interface for ComfyUI connection configuration

**Features**:
- URL input with validation
- Connect/disconnect buttons
- Connection status indicator
- Error messages

## Data Flow

### Workflow Import Flow

```
1. User drops ComfyUI JSON/PNG file
   ↓
2. dropHandlerUtils.ts detects ComfyUI format
   ↓
3. Backend receives comfy_workflow parameter
   ↓
4. Backend converts to NodeTool graph
   ↓
5. Frontend loads workflow with ComfyUI nodes
```

### Node Registration Flow

```
1. User connects to ComfyUI backend
   ↓
2. ComfyUIService fetches /object_info
   ↓
3. comfySchemaConverter converts schemas
   ↓
4. useComfyUINodes registers in MetadataStore
   ↓
5. Nodes appear in node menu
```

### Execution Flow

```
1. User runs workflow with ComfyUI nodes
   ↓
2. comfyExecutor checks if graph has ComfyUI nodes
   ↓
3. If yes: nodeToolGraphToComfyPrompt converts graph
   ↓
4. ComfyUIService submits to /prompt endpoint
   ↓
5. WebSocket streams progress back
   ↓
6. Results displayed in NodeTool
```

## Integration Steps

To fully integrate ComfyUI support into NodeTool:

### 1. Add Settings to Menu

Add `ComfyUISettings` component to the settings menu:

```typescript
// In SettingsMenu.tsx or similar
import ComfyUISettings from './ComfyUISettings';

// Add to menu items
<MenuItem onClick={() => setCurrentView('comfyui')}>
  ComfyUI Connection
</MenuItem>

// Add to content area
{currentView === 'comfyui' && <ComfyUISettings />}
```

### 2. Initialize in App

Call the node loading hook in your main app component:

```typescript
// In App.tsx or main component
import { useComfyUINodes } from './hooks/comfy/useComfyUINodes';

function App() {
  useComfyUINodes(); // Automatically loads nodes when connected
  
  // ... rest of app
}
```

### 3. Route Execution in WorkflowRunner

Modify WorkflowRunner to check for ComfyUI nodes:

```typescript
// In WorkflowRunner.ts run method
import { shouldUseComfyUIExecution, executeViaComfyUI } from './utils/comfyExecutor';

run: async (params, workflow, nodes, edges) => {
  const graph = {
    nodes: nodes.map(reactFlowNodeToGraphNode),
    edges: edges.map(reactFlowEdgeToGraphEdge)
  };
  
  if (shouldUseComfyUIExecution(graph)) {
    // Route to ComfyUI
    return await executeViaComfyUI(graph, (progress) => {
      // Handle progress updates
    });
  }
  
  // Otherwise use normal NodeTool execution
  // ... existing code
}
```

### 4. Add Visual Indicators

Add badges or styling for ComfyUI nodes:

```typescript
// In BaseNode.tsx or similar
import { isComfyUINode } from '../utils/comfyWorkflowConverter';

const nodeStyle = {
  ...baseStyle,
  ...(isComfyUINode(node.type) && {
    border: '2px solid #00bcd4',
    backgroundColor: 'rgba(0, 188, 212, 0.1)'
  })
};
```

### 5. Add Export Functionality

Add export button for ComfyUI workflows:

```typescript
import { nodeToolGraphToComfyWorkflow } from './utils/comfyWorkflowConverter';

const exportAsComfy = () => {
  const comfyWorkflow = nodeToolGraphToComfyWorkflow(graph);
  const json = JSON.stringify(comfyWorkflow, null, 2);
  
  // Download file
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workflow.json';
  a.click();
};
```

## Testing

All components have comprehensive test coverage:

### Running Tests

```bash
# Run all tests
cd web && npm test

# Run ComfyUI-specific tests
npm test -- comfyWorkflowConverter.test.ts comfySchemaConverter.test.ts

# Run with coverage
npm run test:coverage
```

### Test Coverage

- **comfyWorkflowConverter.test.ts**: 11 tests
  - Bidirectional conversion
  - Metadata preservation
  - Prompt generation
  - Node filtering

- **comfySchemaConverter.test.ts**: 5 tests
  - Schema to metadata conversion
  - Type mapping
  - Enum handling
  - Batch conversion

## Configuration

### ComfyUI Backend URL

Stored in localStorage as `comfyui_base_url`. Default: `http://127.0.0.1:8188`

### Environment Variables

No environment variables required. All configuration is runtime.

## Troubleshooting

### Connection Issues

1. Ensure ComfyUI is running on the specified URL
2. Check CORS settings if accessing from different origin
3. Verify WebSocket support in browser

### Node Registration Issues

1. Check ComfyUI `/object_info` endpoint is accessible
2. Verify schema format matches expected structure
3. Check browser console for conversion errors

### Execution Issues

1. Verify all required node inputs are connected or have values
2. Check ComfyUI backend logs for execution errors
3. Ensure ComfyUI WebSocket connection is established

## Future Enhancements

Potential improvements for future versions:

1. **Hybrid Execution**: Mix NodeTool and ComfyUI nodes in same workflow
2. **Visual Grouping**: Collapsible groups for complex ComfyUI workflows
3. **Model Management**: Integrated ComfyUI model browser
4. **Custom Node Installation**: UI for installing ComfyUI custom nodes
5. **Workflow Templates**: Pre-built ComfyUI workflow library
6. **Progress Visualization**: Detailed execution progress for each node
7. **Result Caching**: Cache ComfyUI execution results

## References

- [ComfyUI Documentation](https://github.com/comfyanonymous/ComfyUI)
- [ComfyUI API Reference](https://github.com/comfyanonymous/ComfyUI/wiki/API-Reference)
- [NodeTool Architecture](./web/src/AGENTS.md)
- [Testing Guide](./web/TESTING.md)

## Contributing

When modifying ComfyUI integration:

1. Update type definitions if API changes
2. Add tests for new functionality
3. Run full test suite before committing
4. Update this documentation
5. Ensure type checking and linting pass

## License

Same as NodeTool project license.
