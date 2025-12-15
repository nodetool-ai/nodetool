# Utility Functions Guide

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web AGENTS.md](../AGENTS.md) → **Utils**

This guide helps AI agents understand and work with utility functions in the NodeTool web application.

## Overview

The utils directory contains pure functions and helper utilities organized by functionality. These are framework-agnostic functions that can be used throughout the application.

## Key Utility Files

### 1. Node & Graph Utilities

#### `NodeTypeMapping.ts`
Maps MIME types and internal type names to node types:

```typescript
// Get output node type for a MIME type
const nodeType = getOutputNodeType('image/png'); // 'nodetool.output.ImageOutput'

// Get input node type for data type
const inputType = getInputNodeType('image'); // 'nodetool.input.ImageInput'

// Check if type is supported
const isSupported = isSupportedType('video/mp4'); // true
```

**Use Cases**:
- Creating appropriate nodes from uploaded files
- Determining compatible node types for connections
- File type validation

#### `nodeSearch.ts`
Fuzzy search for nodes using Fuse.js:

```typescript
// Search nodes by name, description, or namespace
const results = searchNodes(metadata, 'blur image');

// Results include score and matched node metadata
results.forEach(result => {
  console.log(result.item.title, result.score);
});
```

**Features**:
- Searches across title, description, namespace, and tags
- Configurable fuzzy matching threshold
- Returns scored results

#### `nodeUtils.ts`
Helper functions for node operations:

```typescript
// Generate unique node ID
const id = generateNodeId('image.blur');

// Check if node is a group
const isGroup = isGroupNode(node);

// Get node color by type
const color = getNodeColor(nodeType);
```

#### `graphCycle.ts`
Detects cycles in workflow graphs:

```typescript
// Check for circular dependencies
const hasCycle = detectCycle(nodes, edges);

if (hasCycle) {
  throw new Error('Workflow contains circular dependencies');
}
```

**Use Cases**:
- Validation before workflow execution
- Preventing infinite loops
- Topological sort validation

### 2. Workflow Utilities

#### `workflowSearch.ts`
Search and filter workflows:

```typescript
// Search by name, tags, description
const results = searchWorkflows(workflows, 'image generation');

// Filter by tags
const filtered = filterByTags(workflows, ['stable-diffusion', 'flux']);
```

#### `workflowUpdates.ts`
Process workflow execution updates:

```typescript
// Handle job update from WebSocket
processJobUpdate(update, {
  onNodeStart: (nodeId) => console.log(`Starting ${nodeId}`),
  onNodeComplete: (nodeId, result) => console.log(`Done ${nodeId}`),
  onError: (error) => console.error(error)
});
```

**Update Types**:
- `node_start`, `node_progress`, `node_update`, `node_error`, `node_complete`
- `job_start`, `job_complete`, `job_error`
- `stream_start`, `stream_chunk`, `stream_complete`

#### `findMatchingNodesInWorkflows.ts`
Find workflows containing specific node types:

```typescript
// Find all workflows using Stable Diffusion
const matches = findMatchingNodes(workflows, 'comfy.sd.StableDiffusion');

// Results include workflow metadata and node positions
matches.forEach(match => {
  console.log(`Found in: ${match.workflow.name}`);
});
```

### 3. Asset & File Utilities

#### `createAssetFile.ts`
Convert various data formats to Asset objects:

```typescript
// From File object
const asset = await createAssetFromFile(file, workflowId);

// From URL (downloads and creates asset)
const asset = await createAssetFromUrl(url, workflowId);

// From base64 data
const asset = await createAssetFromBase64(base64Data, mimeType, workflowId);

// From tensor data
const asset = await createAssetFromTensor(tensorData, workflowId);
```

**Asset Types**: image, video, audio, text, pdf, json, folder

#### `getAssetThumbUrl.ts`
Generate thumbnail URLs for assets:

```typescript
// Get thumbnail URL with size
const thumbUrl = getAssetThumbUrl(assetId, 'medium'); // 256x256

// Available sizes: 'small' (128), 'medium' (256), 'large' (512)
```

#### `getFileExtension.ts`
Extract file extension from filename or path:

```typescript
const ext = getFileExtension('document.pdf'); // 'pdf'
const ext = getFileExtension('/path/to/image.png'); // 'png'
```

#### `fileExplorer.ts`
File system navigation and organization:

```typescript
// Parse folder path
const parts = parseFolderPath('/assets/images/generated');

// Build folder tree structure
const tree = buildFolderTree(assets);

// Get folder contents
const contents = getFolderContents(assets, '/assets/images');
```

### 4. Model Utilities

#### `modelFormatting.tsx`
Format model information for display:

```typescript
// Format model size
const size = formatModelSize(1500000000); // "1.5 GB"

// Format provider name
const name = formatProviderName('huggingface'); // "HuggingFace"

// Get model display name
const display = getModelDisplayName(model); // "Stable Diffusion XL"
```

#### `modelNormalization.ts`
Normalize model data across providers:

```typescript
// Normalize different provider formats to UnifiedModel
const normalized = normalizeHuggingFaceModel(hfModel);
const normalized = normalizeOllamaModel(ollamaModel);

// Result has consistent shape:
interface UnifiedModel {
  type: 'llm' | 'embedding' | 'image' | 'audio';
  provider: string;
  repo_id: string;
  name: string;
  size?: number;
  // ... other fields
}
```

#### `modelFilters.ts`
Filter models by criteria:

```typescript
// Filter by provider
const openAIModels = filterByProvider(models, 'openai');

// Filter by capability
const imageModels = filterByType(models, 'image');

// Filter by size
const smallModels = filterBySize(models, { max: 5000000000 }); // < 5GB
```

#### `modelDownloadCheck.ts`
Check if models are downloaded locally:

```typescript
// Check if model is cached
const isAvailable = await checkModelCache(modelId);

// Get cache path
const path = getModelCachePath(modelId);
```

#### `providerDisplay.ts`
Provider UI helpers:

```typescript
// Get provider icon
const icon = getProviderIcon('anthropic'); // <AnthropicIcon />

// Get provider color
const color = getProviderColor('openai'); // '#10a37f'

// Get provider display name
const name = getProviderDisplayName('hf'); // "HuggingFace"
```

### 5. Search & Filtering Utilities

#### `highlightText.ts`
Highlight search matches in text:

```typescript
// Highlight matches in string
const highlighted = highlightMatches(
  'Stable Diffusion model for image generation',
  ['diffusion', 'image']
);

// Returns JSX with <mark> tags for matches
<span>{highlighted}</span>
```

**Features**:
- Case-insensitive matching
- Multiple search terms
- Customizable highlight styles

#### `TypeHandler.ts`
Handle type conversions and validations:

```typescript
// Check type compatibility
const compatible = isCompatibleType('image', 'texture');

// Convert type to display name
const name = getTypeDisplayName('list[image]'); // "Image List"

// Get type category
const category = getTypeCategory('video'); // "media"
```

### 6. UI & Formatting Utilities

#### `formatDateAndTime.ts`
Date and time formatting:

```typescript
// Format relative time
const relative = formatRelativeTime(date); // "2 hours ago"

// Format absolute time
const absolute = formatDateTime(date); // "Dec 15, 2024 at 3:45 PM"

// Format date only
const dateOnly = formatDate(date); // "Dec 15, 2024"
```

#### `groupByDate.ts`
Group items by date:

```typescript
// Group workflows by date
const grouped = groupByDate(workflows, (w) => w.created_at);

// Result structure:
{
  'Today': [...],
  'Yesterday': [...],
  'Last Week': [...],
  'Dec 2024': [...],
  // ...
}
```

#### `formatUtils.ts`
General formatting utilities:

```typescript
// Format file size
const size = formatBytes(1024000); // "1.0 MB"

// Truncate text
const short = truncate('Long text...', 50); // "Long text..."

// Format duration
const duration = formatDuration(3665); // "1h 1m 5s"
```

#### `ColorUtils.ts`
Color manipulation and conversion:

```typescript
// Convert hex to RGB
const rgb = hexToRgb('#ff5733'); // { r: 255, g: 87, b: 51 }

// Lighten/darken color
const lighter = lightenColor('#ff5733', 0.2);
const darker = darkenColor('#ff5733', 0.2);

// Get contrasting text color
const textColor = getContrastColor('#ff5733'); // '#ffffff' or '#000000'
```

### 7. Handle & Connection Utilities

#### `handleUtils.ts`
Node handle positioning and management:

```typescript
// Get handle position
const position = getHandlePosition(node, handleId);

// Calculate connection path
const path = getConnectionPath(sourceHandle, targetHandle);

// Validate handle connection
const valid = isValidConnection(sourceHandle, targetHandle, metadata);
```

**Use Cases**:
- Custom edge rendering
- Connection validation
- Handle positioning

### 8. Layout & View Utilities

#### `dockviewLayout.ts`
Dockview panel layout management:

```typescript
// Save layout to localStorage
saveLayout('dashboard', layoutJson);

// Restore layout
const layout = loadLayout('dashboard');

// Apply layout safely (with validation)
applyLayoutSafe(dockviewApi, layout);
```

**Features**:
- Layout persistence
- Validation before applying
- Error recovery

#### `MousePosition.ts`
Track mouse position for UI elements:

```typescript
// Get mouse position relative to element
const position = getMousePosition(event, containerRef.current);

// Result: { x: number, y: number }
```

### 9. Data Processing Utilities

#### `binary.ts`
Binary data utilities:

```typescript
// Convert ArrayBuffer to base64
const base64 = arrayBufferToBase64(buffer);

// Convert base64 to ArrayBuffer
const buffer = base64ToArrayBuffer(base64);

// Detect file type from buffer
const type = detectMimeType(buffer); // 'image/png'
```

#### `sanitize.ts`
Input sanitization:

```typescript
// Sanitize HTML
const clean = sanitizeHtml(userInput);

// Sanitize filename
const safe = sanitizeFilename('my/file?.txt'); // 'my_file.txt'

// Escape special characters
const escaped = escapeRegex('[test]'); // '\\[test\\]'
```

### 10. Browser & Platform Utilities

#### `browser.ts`
Browser feature detection:

```typescript
// Check WebSocket support
const hasWS = supportsWebSocket();

// Check WebGL support
const hasWebGL = supportsWebGL();

// Check File API support
const hasFile = supportsFileAPI();

// Get browser info
const info = getBrowserInfo(); // { name: 'chrome', version: '120' }
```

#### `platform.ts`
Platform detection:

```typescript
const isMac = platform === 'mac';
const isWindows = platform === 'win';
const isLinux = platform === 'linux';
```

#### `isUrlAccessible.ts`
Check if URL is accessible:

```typescript
// Check if URL returns 200
const accessible = await isUrlAccessible(url);
```

### 11. Error Handling Utilities

#### `errorHandling.ts`
Error processing and formatting:

```typescript
// Extract error message
const message = getErrorMessage(error);

// Format error for display
const formatted = formatError(error);

// Check error type
const isNetwork = isNetworkError(error);
const isTimeout = isTimeoutError(error);
```

## Utility Patterns

### 1. Pure Functions

All utilities should be pure functions when possible:

```typescript
// ✅ Good - pure function
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

// ❌ Bad - side effects
let lastBytes = 0;
export const formatBytes = (bytes: number): string => {
  lastBytes = bytes; // Side effect!
  // ... formatting
};
```

### 2. Type Safety

Always use TypeScript with explicit types:

```typescript
// ✅ Good
export const getNodeColor = (nodeType: string): string => {
  return NODE_COLORS[nodeType] ?? '#808080';
};

// ❌ Bad
export const getNodeColor = (nodeType: any) => {
  return NODE_COLORS[nodeType] ?? '#808080';
};
```

### 3. Error Handling

Handle errors gracefully:

```typescript
// ✅ Good
export const parseJSON = <T>(json: string): T | null => {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return null;
  }
};
```

### 4. Documentation

Add JSDoc comments for complex utilities:

```typescript
/**
 * Converts a graph node to ReactFlow node format.
 * 
 * @param node - Backend graph node
 * @param position - Optional position override
 * @returns ReactFlow node with proper typing and metadata
 * 
 * @example
 * const rfNode = graphNodeToReactFlowNode(graphNode, { x: 100, y: 200 });
 */
export const graphNodeToReactFlowNode = (
  node: GraphNode,
  position?: { x: number; y: number }
): Node => {
  // implementation
};
```

## Testing Utilities

### Test Location
Place utility tests in `__tests__` subdirectory:
- `/utils/__tests__/myUtil.test.ts`

### Testing Pattern

```typescript
import { formatBytes } from '../formatUtils';

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
  
  it('handles negative values', () => {
    expect(formatBytes(-1024)).toBe('-1.0 KB');
  });
});
```

## Best Practices

### 1. Single Responsibility
Each utility should do one thing well:

```typescript
// ✅ Good - single purpose
export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
};

// ❌ Bad - multiple responsibilities
export const processFilename = (filename: string) => {
  const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const extension = getFileExtension(sanitized);
  const validated = validateExtension(extension);
  // ...
};
```

### 2. Composability
Build complex utilities from simple ones:

```typescript
// Simple utilities
const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9.-]/g, '_');
const getFileExtension = (name: string) => name.split('.').pop() || '';
const validateExtension = (ext: string) => ALLOWED_EXTENSIONS.includes(ext);

// Composed utility
export const processUploadedFile = (file: File) => {
  const sanitized = sanitizeFilename(file.name);
  const extension = getFileExtension(sanitized);
  const valid = validateExtension(extension);
  
  return { name: sanitized, extension, valid };
};
```

### 3. Consistent Naming
- Use verbs for actions: `formatDate`, `parseJSON`, `validateEmail`
- Use nouns for getters: `getFileExtension`, `getNodeColor`
- Use `is`/`has` for booleans: `isValidEmail`, `hasProperty`

### 4. Performance
- Cache expensive computations
- Use memoization when appropriate
- Avoid unnecessary object creation

```typescript
// ✅ Good - memoized
const colorCache = new Map<string, string>();

export const getNodeColor = (nodeType: string): string => {
  if (colorCache.has(nodeType)) {
    return colorCache.get(nodeType)!;
  }
  
  const color = computeColor(nodeType);
  colorCache.set(nodeType, color);
  return color;
};
```

## Common Patterns in NodeTool

### Working with Assets

```typescript
import { createAssetFromFile } from './createAssetFile';
import { getAssetThumbUrl } from './getAssetThumbUrl';
import { getFileExtension } from './getFileExtension';

const handleFileUpload = async (file: File) => {
  // Validate file type
  const ext = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  
  // Create asset
  const asset = await createAssetFromFile(file, workflowId);
  
  // Get thumbnail
  const thumbUrl = getAssetThumbUrl(asset.id, 'medium');
  
  return { asset, thumbUrl };
};
```

### Search & Filtering

```typescript
import { searchNodes } from './nodeSearch';
import { highlightMatches } from './highlightText';

const searchResults = searchNodes(metadata, query);

const ResultItem = ({ result }) => {
  const highlighted = highlightMatches(result.item.title, [query]);
  return <div>{highlighted}</div>;
};
```

### Date Formatting

```typescript
import { formatRelativeTime } from './formatDateAndTime';
import { groupByDate } from './groupByDate';

// Show relative time
const time = formatRelativeTime(workflow.updated_at);

// Group workflows by date
const grouped = groupByDate(workflows, w => w.created_at);
```

## Related Documentation

- [Hooks Guide](../hooks/AGENTS.md) - Using utilities in hooks
- [Components Guide](../components/AGENTS.md) - Using utilities in components
- [Stores Guide](../stores/AGENTS.md) - State management utilities
- [Root AGENTS.md](../../../AGENTS.md) - Project overview

## Quick Reference

### Most Used Utilities
1. `NodeTypeMapping` - Type conversions for nodes
2. `createAssetFile` - Asset creation from various formats
3. `formatDateAndTime` - Date/time formatting
4. `nodeSearch` - Fuzzy search for nodes
5. `highlightText` - Search result highlighting

### Utility Categories by Use Case
- **Type Handling**: `NodeTypeMapping`, `TypeHandler`
- **Asset Processing**: `createAssetFile`, `getAssetThumbUrl`, `getFileExtension`
- **Model Management**: `modelFormatting`, `modelNormalization`, `modelFilters`
- **Search**: `nodeSearch`, `workflowSearch`, `highlightText`
- **Formatting**: `formatDateAndTime`, `formatUtils`, `ColorUtils`
- **Graph Operations**: `graphCycle`, `findMatchingNodesInWorkflows`

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
