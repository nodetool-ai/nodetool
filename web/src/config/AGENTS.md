# Configuration Guide

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web AGENTS.md](../AGENTS.md) → **Config**

This guide helps AI agents understand the configuration system in the NodeTool web application.

## Overview

The `config` directory contains application-wide configuration files, constants, and data type definitions. These files define the behavior, appearance, and functionality of the application.

## Configuration Files

### constants.ts

Core application constants:

```typescript
// Application metadata
export const APP_NAME = 'NodeTool';
export const APP_VERSION = '1.0.0';
export const API_VERSION = 'v1';

// UI defaults
export const DEFAULT_ZOOM = 1;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

// Editor defaults
export const DEFAULT_NODE_WIDTH = 200;
export const DEFAULT_NODE_HEIGHT = 100;
export const GRID_SIZE = 20;
export const SNAP_TO_GRID = true;

// Model defaults
export const DEFAULT_MODEL = 'gpt-4-mini';
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 2048;

// Search configuration
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_THRESHOLD = 0.4; // Fuse.js threshold

// File upload limits
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
export const ALLOWED_AUDIO_TYPES = ['audio/mp3', 'audio/wav', 'audio/ogg'];

// Workflow execution
export const MAX_EXECUTION_TIME = 3600000; // 1 hour in ms
export const PROGRESS_UPDATE_INTERVAL = 100; // ms

// Cache configuration
export const ASSET_CACHE_TIME = 5 * 60 * 1000; // 5 minutes
export const WORKFLOW_CACHE_TIME = 2 * 60 * 1000; // 2 minutes
export const MODEL_CACHE_TIME = 10 * 60 * 1000; // 10 minutes

// Keyboard shortcuts
export const META_KEY = navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl';
```

**Usage**:
```typescript
import { APP_NAME, DEFAULT_ZOOM, META_KEY } from '../config/constants';

console.log(`Welcome to ${APP_NAME}`);
const zoom = DEFAULT_ZOOM;
const shortcut = `${META_KEY}+S`;
```

### shortcuts.ts

Keyboard shortcut definitions:

```typescript
export interface ShortcutDefinition {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  category: string;
}

export const SHORTCUTS: Record<string, ShortcutDefinition> = {
  // Editor shortcuts
  save: {
    key: 'KeyS',
    ctrl: true,
    description: 'Save workflow',
    category: 'Editor'
  },
  
  undo: {
    key: 'KeyZ',
    ctrl: true,
    description: 'Undo last action',
    category: 'Editor'
  },
  
  redo: {
    key: 'KeyZ',
    ctrl: true,
    shift: true,
    description: 'Redo last action',
    category: 'Editor'
  },
  
  // Selection shortcuts
  selectAll: {
    key: 'KeyA',
    ctrl: true,
    description: 'Select all nodes',
    category: 'Selection'
  },
  
  delete: {
    key: 'Delete',
    description: 'Delete selected nodes',
    category: 'Selection'
  },
  
  // Copy/Paste
  copy: {
    key: 'KeyC',
    ctrl: true,
    description: 'Copy selected nodes',
    category: 'Clipboard'
  },
  
  cut: {
    key: 'KeyX',
    ctrl: true,
    description: 'Cut selected nodes',
    category: 'Clipboard'
  },
  
  paste: {
    key: 'KeyV',
    ctrl: true,
    description: 'Paste nodes',
    category: 'Clipboard'
  },
  
  // View shortcuts
  zoomIn: {
    key: 'Equal',
    ctrl: true,
    description: 'Zoom in',
    category: 'View'
  },
  
  zoomOut: {
    key: 'Minus',
    ctrl: true,
    description: 'Zoom out',
    category: 'View'
  },
  
  fitView: {
    key: 'KeyF',
    ctrl: true,
    description: 'Fit view to nodes',
    category: 'View'
  },
  
  // Node menu
  addNode: {
    key: 'Space',
    description: 'Open node menu',
    category: 'Editor'
  },
  
  // Alignment
  alignLeft: {
    key: 'KeyL',
    ctrl: true,
    shift: true,
    description: 'Align nodes left',
    category: 'Alignment'
  },
  
  alignRight: {
    key: 'KeyR',
    ctrl: true,
    shift: true,
    description: 'Align nodes right',
    category: 'Alignment'
  },
  
  // Command palette
  commandPalette: {
    key: 'KeyK',
    ctrl: true,
    description: 'Open command palette',
    category: 'Navigation'
  }
};

// Get shortcut display string
export const getShortcutDisplay = (shortcut: ShortcutDefinition): string => {
  const parts: string[] = [];
  
  if (shortcut.ctrl) parts.push(META_KEY);
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  
  // Convert KeyX to X
  const key = shortcut.key.replace('Key', '');
  parts.push(key);
  
  return parts.join('+');
};

// Get shortcuts by category
export const getShortcutsByCategory = (category: string): ShortcutDefinition[] => {
  return Object.values(SHORTCUTS).filter(s => s.category === category);
};
```

**Usage**:
```typescript
import { SHORTCUTS, getShortcutDisplay } from '../config/shortcuts';

// Display shortcut
const saveShortcut = getShortcutDisplay(SHORTCUTS.save); // "Ctrl+S" or "Cmd+S"

// Use in keyboard handler
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.code === SHORTCUTS.save.key && e.ctrlKey) {
    e.preventDefault();
    saveWorkflow();
  }
};
```

### models.ts

Pre-configured AI model definitions:

```typescript
export interface UnifiedModel {
  type: 'llm' | 'embedding' | 'image' | 'audio' | 'video';
  provider: string;
  repo_id: string;
  name: string;
  size?: number;
  architecture?: string;
  capabilities?: string[];
  description?: string;
  tags?: string[];
}

// Local LLM models
export const LOCAL_LLMS: UnifiedModel[] = [
  {
    type: 'llm',
    provider: 'ollama',
    repo_id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    size: 3_000_000_000,
    architecture: 'llama',
    capabilities: ['chat', 'completion'],
    description: 'Fast, efficient chat model',
    tags: ['local', 'fast']
  },
  {
    type: 'llm',
    provider: 'ollama',
    repo_id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B',
    size: 8_000_000_000,
    architecture: 'deepseek',
    capabilities: ['chat', 'reasoning'],
    description: 'Reasoning-optimized model',
    tags: ['local', 'reasoning']
  }
];

// HuggingFace recommended models
export const HUGGINGFACE_MODELS: UnifiedModel[] = [
  {
    type: 'image',
    provider: 'huggingface',
    repo_id: 'black-forest-labs/FLUX.1-dev',
    name: 'Flux.1 Dev',
    architecture: 'flux',
    capabilities: ['text-to-image', 'image-to-image'],
    description: 'State-of-the-art image generation',
    tags: ['image', 'popular']
  },
  {
    type: 'image',
    provider: 'huggingface',
    repo_id: 'stabilityai/stable-diffusion-xl-base-1.0',
    name: 'Stable Diffusion XL',
    architecture: 'sdxl',
    capabilities: ['text-to-image'],
    description: 'High-quality image generation',
    tags: ['image', 'stable-diffusion']
  }
];

// Cloud provider models
export const CLOUD_MODELS: UnifiedModel[] = [
  {
    type: 'llm',
    provider: 'openai',
    repo_id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    capabilities: ['chat', 'completion', 'vision'],
    description: 'Most capable OpenAI model',
    tags: ['cloud', 'multimodal']
  },
  {
    type: 'llm',
    provider: 'anthropic',
    repo_id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    capabilities: ['chat', 'completion', 'vision'],
    description: 'Advanced reasoning and analysis',
    tags: ['cloud', 'reasoning']
  }
];

// Get models by provider
export const getModelsByProvider = (provider: string): UnifiedModel[] => {
  return [...LOCAL_LLMS, ...HUGGINGFACE_MODELS, ...CLOUD_MODELS]
    .filter(m => m.provider === provider);
};

// Get models by type
export const getModelsByType = (type: string): UnifiedModel[] => {
  return [...LOCAL_LLMS, ...HUGGINGFACE_MODELS, ...CLOUD_MODELS]
    .filter(m => m.type === type);
};

// Get recommended models for task
export const getRecommendedModels = (task: string): UnifiedModel[] => {
  const taskMap: Record<string, string[]> = {
    'text-generation': ['llm'],
    'image-generation': ['image'],
    'chat': ['llm'],
    'embeddings': ['embedding']
  };
  
  const types = taskMap[task] || [];
  return [...LOCAL_LLMS, ...HUGGINGFACE_MODELS, ...CLOUD_MODELS]
    .filter(m => types.includes(m.type));
};
```

### data_types.tsx

Node data type definitions and colors:

```typescript
import { ReactElement } from 'react';

export interface DataTypeDefinition {
  name: string;
  color: string;
  icon?: ReactElement;
  description: string;
  category: 'primitive' | 'media' | 'collection' | 'ml' | 'custom';
}

export const DATA_TYPES: Record<string, DataTypeDefinition> = {
  // Primitives
  string: {
    name: 'String',
    color: '#4CAF50',
    description: 'Text data',
    category: 'primitive'
  },
  
  int: {
    name: 'Integer',
    color: '#2196F3',
    description: 'Whole numbers',
    category: 'primitive'
  },
  
  float: {
    name: 'Float',
    color: '#03A9F4',
    description: 'Decimal numbers',
    category: 'primitive'
  },
  
  bool: {
    name: 'Boolean',
    color: '#FF9800',
    description: 'True/False values',
    category: 'primitive'
  },
  
  // Media types
  image: {
    name: 'Image',
    color: '#E91E63',
    description: 'Image data',
    category: 'media'
  },
  
  video: {
    name: 'Video',
    color: '#9C27B0',
    description: 'Video data',
    category: 'media'
  },
  
  audio: {
    name: 'Audio',
    color: '#673AB7',
    description: 'Audio data',
    category: 'media'
  },
  
  // Collections
  'list[any]': {
    name: 'List',
    color: '#795548',
    description: 'List of items',
    category: 'collection'
  },
  
  dict: {
    name: 'Dictionary',
    color: '#607D8B',
    description: 'Key-value pairs',
    category: 'collection'
  },
  
  // ML types
  tensor: {
    name: 'Tensor',
    color: '#FF5722',
    description: 'Multi-dimensional array',
    category: 'ml'
  },
  
  model: {
    name: 'Model',
    color: '#F44336',
    description: 'ML model',
    category: 'ml'
  }
};

// Get color for data type
export const getDataTypeColor = (type: string): string => {
  return DATA_TYPES[type]?.color || '#808080';
};

// Check if types are compatible
export const areTypesCompatible = (sourceType: string, targetType: string): boolean => {
  // Exact match
  if (sourceType === targetType) return true;
  
  // Any accepts all
  if (targetType === 'any') return true;
  
  // Numeric compatibility
  if ((sourceType === 'int' || sourceType === 'float') && 
      (targetType === 'int' || targetType === 'float')) {
    return true;
  }
  
  // List compatibility
  if (sourceType.startsWith('list[') && targetType === 'list[any]') {
    return true;
  }
  
  return false;
};
```

### comfy_data_types.tsx

ComfyUI-specific data type definitions (for ComfyUI node compatibility):

```typescript
export const COMFY_DATA_TYPES = {
  // Core types
  MODEL: { name: 'MODEL', color: '#FF6B6B' },
  CLIP: { name: 'CLIP', color: '#4ECDC4' },
  VAE: { name: 'VAE', color: '#45B7D1' },
  CONDITIONING: { name: 'CONDITIONING', color: '#96CEB4' },
  LATENT: { name: 'LATENT', color: '#FFEAA7' },
  IMAGE: { name: 'IMAGE', color: '#DFE6E9' },
  MASK: { name: 'MASK', color: '#B2BEC3' },
  
  // Additional types
  CONTROL_NET: { name: 'CONTROL_NET', color: '#FD79A8' },
  SAMPLER: { name: 'SAMPLER', color: '#FDCB6E' },
  SIGMAS: { name: 'SIGMAS', color: '#6C5CE7' }
};
```

### comfy_colors.ts

ComfyUI node color scheme:

```typescript
export const COMFY_COLORS = {
  // Node categories
  'sampling': '#4CAF50',
  'conditioning': '#2196F3',
  'latent': '#FF9800',
  'image': '#9C27B0',
  'loader': '#F44336',
  '_for_testing': '#00BCD4',
  
  // Fallback
  'default': '#607D8B'
};

export const getComfyNodeColor = (category: string): string => {
  return COMFY_COLORS[category] || COMFY_COLORS.default;
};
```

### defaultLayouts.ts

Default Dockview panel layouts:

```typescript
export const DEFAULT_DASHBOARD_LAYOUT = {
  orientation: 'HORIZONTAL',
  children: [
    {
      type: 'panel',
      id: 'workflows',
      title: 'Workflows',
      size: 50
    },
    {
      type: 'panel',
      id: 'chat',
      title: 'Chat',
      size: 50
    }
  ]
};

export const DEFAULT_EDITOR_LAYOUT = {
  orientation: 'HORIZONTAL',
  children: [
    {
      type: 'panel',
      id: 'node-menu',
      title: 'Nodes',
      size: 20
    },
    {
      type: 'panel',
      id: 'editor',
      title: 'Editor',
      size: 60
    },
    {
      type: 'panel',
      id: 'inspector',
      title: 'Inspector',
      size: 20
    }
  ]
};
```

## Best Practices

### 1. Constants Organization

Group related constants together:

```typescript
// ✅ Good - organized by domain
export const EDITOR_DEFAULTS = {
  ZOOM: 1,
  GRID_SIZE: 20,
  SNAP_TO_GRID: true
} as const;

// ❌ Bad - scattered
export const DEFAULT_ZOOM = 1;
export const GRID_SIZE = 20;
```

### 2. Type Safety

Use TypeScript for configuration:

```typescript
// ✅ Good - typed configuration
interface ModelConfig {
  type: 'llm' | 'image';
  provider: string;
  repo_id: string;
}

export const MODEL: ModelConfig = {
  type: 'llm',
  provider: 'openai',
  repo_id: 'gpt-4'
};

// ❌ Bad - untyped
export const MODEL = {
  type: 'llm',
  provider: 'openai',
  repo_id: 'gpt-4'
};
```

### 3. Environment Variables

Use environment variables for deployment-specific config:

```typescript
// ✅ Good - environment-aware
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7777';
export const DEBUG = import.meta.env.DEV;

// ❌ Bad - hardcoded
export const API_URL = 'http://localhost:7777';
```

### 4. Immutability

Use `as const` for immutable configurations:

```typescript
// ✅ Good - immutable
export const ALLOWED_TYPES = ['image', 'video', 'audio'] as const;
type AllowedType = typeof ALLOWED_TYPES[number]; // 'image' | 'video' | 'audio'

// ❌ Bad - mutable
export const ALLOWED_TYPES = ['image', 'video', 'audio'];
```

## Related Documentation

- [Components Guide](../components/AGENTS.md) - Using configuration in components
- [Stores Guide](../stores/AGENTS.md) - Configuration in stores
- [Utils Guide](../utils/AGENTS.md) - Configuration utilities
- [Root AGENTS.md](../../../AGENTS.md) - Project overview

## Quick Reference

### Import Patterns
```typescript
import { APP_NAME, DEFAULT_ZOOM } from '../config/constants';
import { SHORTCUTS } from '../config/shortcuts';
import { LOCAL_LLMS, getModelsByProvider } from '../config/models';
import { DATA_TYPES, getDataTypeColor } from '../config/data_types';
```

### Common Configuration Tasks
- **Add shortcut**: Update `shortcuts.ts` with new ShortcutDefinition
- **Add model**: Add to appropriate array in `models.ts`
- **Add data type**: Add to `DATA_TYPES` in `data_types.tsx`
- **Update constants**: Modify `constants.ts` (avoid breaking changes)

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
