I'll analyze the current codebase to understand the existing drag & drop implementations and provide an improved, more accurate plan. Now let me check the project structure and find additional relevant files to refine the implementation plan: Now I have a complete picture of all the drag & drop implementations. Let me also check the project structure for the entry point and any existing lib folder: Now I have a comprehensive understanding of the codebase. Let me provide an improved and more detailed implementation plan that accounts for the actual patterns and structure in the repository:

---

## Improved Implementation Plan:  Unified Drag & Drop System

Based on my analysis of the actual codebase, here's a refined, more actionable plan: 

### Key Findings from Code Analysis

1. **Current Implementations Found:**
   - `useDropHandler. ts` (168 lines) - Canvas drop for nodes, assets, files
   - `useDragAndDrop.ts` (94 lines) - Chat interface drops
   - `useFileDrop.ts` (143 lines) - Typed file validation drops
   - `useCollectionDragAndDrop.ts` (140 lines) - Collection file indexing
   - `useAssetActions.ts` (198 lines) - Asset drag/folder drops
   - `useDragHandlers.ts` (254 lines) - Node canvas grouping/ungrouping (ReactFlow-specific)

2. **Existing Data Transfer Keys:**
   - `"create-node"` - Node metadata from node menu
   - `"asset"` - Single asset JSON
   - `"selectedAssetIds"` - Multiple asset IDs
   - `"text/plain"` - Tab reordering in TabsBar

3. **Existing Patterns:**
   - Manual `JSON.stringify`/`JSON.parse` everywhere
   - Direct `e.dataTransfer.setData()` calls scattered in components
   - Drag images created with inline styles
   - No centralized validation

4. **App Entry Point:** `web/src/index.tsx` uses nested providers including `WorkflowManagerProvider`, `KeyboardProvider`, etc.

5. **Existing lib folder:** `web/src/lib/` contains `supabaseClient.ts`, `tools/`, `websocket/`

---

### Revised Implementation Plan

#### Phase 1: Core Infrastructure (Priority:  Critical)

Create `web/src/lib/dragdrop/` with the following refined structure:

##### 1. Type Definitions (`types.ts`)

```typescript
/**
 * Supported drag data types in the application. 
 * Maps to existing dataTransfer keys for backward compatibility.
 */
export type DragDataType =
  | 'create-node'        // Node from node menu (maps to existing "create-node" key)
  | 'asset'              // Single asset (maps to existing "asset" key)
  | 'assets-multiple'    // Multiple assets (maps to existing "selectedAssetIds" key)
  | 'file'               // External file from OS
  | 'tab'                // Editor tab reordering
  | 'collection-file';   // File being added to collection

/**
 * Type-safe payload definitions for each drag type
 */
export interface DragPayloadMap {
  'create-node': import('../../stores/ApiTypes').NodeMetadata;
  'asset': import('../../stores/ApiTypes').Asset;
  'assets-multiple':  string[]; // Asset IDs
  'file': File;
  'tab': string; // Workflow ID
  'collection-file': File;
}

/**
 * Structured drag data with compile-time type safety
 */
export interface DragData<T extends DragDataType = DragDataType> {
  type: T;
  payload:  DragPayloadMap[T];
  metadata?: DragMetadata;
}

export interface DragMetadata {
  sourceId?:  string;
  sourceName?: string;
  count?: number;
  thumbnailUrl?: string;
}

/**
 * Drop zone configuration with type-safe handlers
 */
export interface DropZoneConfig<T extends DragDataType = DragDataType> {
  /** Accepted drag data types */
  accepts: T[];
  
  /** Handler called when valid data is dropped */
  onDrop: (data: DragData<T>, event: React.DragEvent, position?:  { x: number; y: number }) => void | Promise<void>;
  
  /** Optional validation beyond type checking */
  validate?: (data: DragData<T>, event: React.DragEvent) => boolean | Promise<boolean>;
  
  /** Whether to convert screen position to flow position (for ReactFlow canvas) */
  useFlowPosition?: boolean;
  
  /** CSS class applied when dragging over */
  activeClassName?: string;
  
  /** CSS class applied when drop is valid */
  validClassName?: string;
  
  /** Disable the drop zone */
  disabled?: boolean;
}

/**
 * Draggable element options
 */
export interface DraggableOptions {
  /** Custom drag image element or configuration */
  dragImage?: HTMLElement | DragImageConfig;
  
  /** Called when drag starts */
  onDragStart?: (event: React. DragEvent) => void;
  
  /** Called when drag ends */
  onDragEnd?: (event: React.DragEvent) => void;
  
  /** Disable dragging */
  disabled?: boolean;
  
  /** Drop effect to show */
  effectAllowed?: DataTransfer['effectAllowed'];
}

export interface DragImageConfig {
  /** Badge showing count */
  count?: number;
  /** Custom content to show */
  content?: string;
  /** Position offset */
  offset?: { x:  number; y: number };
}

/**
 * Global drag state exposed through context
 */
export interface DragDropState {
  /** Currently active drag data (null when not dragging) */
  activeDrag: DragData | null;
  
  /** Whether any drag operation is in progress */
  isDragging: boolean;
}
```

##### 2. Serialization Utilities (`serialization.ts`)

```typescript
import { DragData, DragDataType, DragPayloadMap } from './types';

/** Custom MIME type for internal drag data */
export const DRAG_DATA_MIME = 'application/x-nodetool-drag';

/** Legacy key mapping for backward compatibility */
const LEGACY_KEY_MAP: Record<DragDataType, string> = {
  'create-node': 'create-node',
  'asset': 'asset',
  'assets-multiple': 'selectedAssetIds',
  'file': '', // External files don't use custom keys
  'tab': 'text/plain',
  'collection-file': ''
};

/**
 * Serialize drag data with backward compatibility
 */
export function serializeDragData<T extends DragDataType>(
  data: DragData<T>,
  dataTransfer: DataTransfer
): void {
  // Set new unified format
  const serialized = JSON.stringify(data);
  dataTransfer.setData(DRAG_DATA_MIME, serialized);
  
  // Also set legacy format for backward compatibility
  const legacyKey = LEGACY_KEY_MAP[data.type];
  if (legacyKey) {
    dataTransfer. setData(legacyKey, JSON.stringify(data. payload));
  }
  
  // Special handling for assets - also set the "asset" key for single asset
  if (data.type === 'assets-multiple' && Array.isArray(data.payload) && data.payload.length === 1) {
    // If there's only one asset, also set the single asset key
    // Note: This requires access to the full asset object, which should be in metadata
    if (data.metadata?.sourceId) {
      // The asset object should be passed via metadata for backward compat
    }
  }
}

/**
 * Deserialize drag data with fallback to legacy formats
 */
export function deserializeDragData(dataTransfer: DataTransfer): DragData | null {
  // Try new unified format first
  const unified = dataTransfer.getData(DRAG_DATA_MIME);
  if (unified) {
    try {
      return JSON.parse(unified) as DragData;
    } catch {
      console.warn('Failed to parse unified drag data');
    }
  }
  
  // Fall back to legacy formats
  const createNode = dataTransfer.getData('create-node');
  if (createNode) {
    try {
      return {
        type: 'create-node',
        payload: JSON. parse(createNode)
      };
    } catch { /* ignore */ }
  }
  
  const asset = dataTransfer.getData('asset');
  const selectedAssetIds = dataTransfer.getData('selectedAssetIds');
  
  if (selectedAssetIds) {
    try {
      const ids = JSON.parse(selectedAssetIds) as string[];
      return {
        type: 'assets-multiple',
        payload: ids,
        metadata: { count: ids.length }
      };
    } catch { /* ignore */ }
  }
  
  if (asset) {
    try {
      return {
        type: 'asset',
        payload: JSON.parse(asset)
      };
    } catch { /* ignore */ }
  }
  
  // Check for external files
  if (hasExternalFiles(dataTransfer)) {
    return null; // Handle files separately in drop zone
  }
  
  return null;
}

/**
 * Check if dataTransfer contains external files
 */
export function hasExternalFiles(dataTransfer: DataTransfer): boolean {
  // Check items for file kind
  if (dataTransfer.items) {
    return Array.from(dataTransfer.items).some(item => item.kind === 'file');
  }
  // Fallback to files property
  return dataTransfer.files. length > 0;
}

/**
 * Extract files from dataTransfer
 */
export function extractFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files);
}

/**
 * Create a count badge drag image element
 */
export function createDragCountBadge(count: number): HTMLElement {
  const dragImage = document.createElement('div');
  dragImage.textContent = count.toString();
  dragImage.style.cssText = `
    position: absolute;
    top: -99999px;
    background-color:  #222;
    color: #999;
    border: 3px solid #333;
    border-radius: 4px;
    height: 40px;
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: bold;
  `;
  return dragImage;
}
```

##### 3. Zustand Store (`store. ts`) - Using Existing Pattern

```typescript
import { create } from 'zustand';
import { DragData, DragDropState } from './types';

interface DragDropStore extends DragDropState {
  setActiveDrag: (data: DragData | null) => void;
  clearDrag: () => void;
}

/**
 * Global drag & drop state store using Zustand (consistent with app patterns)
 */
export const useDragDropStore = create<DragDropStore>((set) => ({
  activeDrag: null,
  isDragging: false,
  
  setActiveDrag: (data) => set({ 
    activeDrag: data, 
    isDragging: data !== null 
  }),
  
  clearDrag: () => set({ 
    activeDrag: null, 
    isDragging: false 
  })
}));
```

##### 4. useDraggable Hook (`useDraggable.ts`)

```typescript
import { useCallback, useMemo, useRef } from 'react';
import { useDragDropStore } from './store';
import { DragData, DragDataType, DraggableOptions, DragImageConfig } from './types';
import { serializeDragData, createDragCountBadge } from './serialization';

/**
 * Hook to make any element draggable with type-safe data
 * 
 * @example
 * // In node menu
 * const NodeMenuItem = ({ node }: { node: NodeMetadata }) => {
 *   const dragProps = useDraggable({
 *     type: 'create-node',
 *     payload: node
 *   });
 *   return <div {...dragProps}>{node.title}</div>;
 * };
 * 
 * @example
 * // In asset grid with count badge
 * const AssetItem = ({ asset, selectedCount }) => {
 *   const dragProps = useDraggable(
 *     { type: 'asset', payload:  asset },
 *     { dragImage: { count: selectedCount } }
 *   );
 *   return <div {...dragProps}>{asset.name}</div>;
 * };
 */
export function useDraggable<T extends DragDataType>(
  data: DragData<T>,
  options?:  DraggableOptions
) {
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);
  const dragImageRef = useRef<HTMLElement | null>(null);

  const handleDragStart = useCallback((event: React.DragEvent) => {
    if (options?.disabled) {
      event.preventDefault();
      return;
    }

    // Serialize data to dataTransfer
    serializeDragData(data, event.dataTransfer);
    
    // Set effect
    event.dataTransfer.effectAllowed = options?. effectAllowed ??  'move';
    
    // Handle drag image
    if (options?.dragImage) {
      let imageElement: HTMLElement;
      
      if (options.dragImage instanceof HTMLElement) {
        imageElement = options.dragImage;
      } else {
        // DragImageConfig
        const config = options.dragImage as DragImageConfig;
        if (config.count !== undefined) {
          imageElement = createDragCountBadge(config.count);
        } else if (config.content) {
          imageElement = document.createElement('div');
          imageElement.textContent = config.content;
          imageElement.style.cssText = 'position: absolute; top: -99999px;';
        } else {
          imageElement = event.currentTarget as HTMLElement;
        }
      }
      
      // Append temporarily if not in DOM
      if (!imageElement.parentElement) {
        document.body.appendChild(imageElement);
        dragImageRef.current = imageElement;
      }
      
      const offset = (options.dragImage as DragImageConfig)?.offset ??  { x: 25, y: 30 };
      event.dataTransfer.setDragImage(imageElement, offset.x, offset.y);
    }
    
    // Update global state
    setActiveDrag(data);
    
    // Call user callback
    options?.onDragStart?.(event);
  }, [data, options, setActiveDrag]);

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    // Clean up drag image
    if (dragImageRef.current && dragImageRef.current.parentElement) {
      dragImageRef.current.parentElement. removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
    
    clearDrag();
    options?.onDragEnd?.(event);
  }, [clearDrag, options]);

  return useMemo(() => ({
    draggable: ! options?.disabled,
    onDragStart: handleDragStart,
    onDragEnd:  handleDragEnd,
    'data-drag-type': data.type
  }), [data.type, handleDragStart, handleDragEnd, options?. disabled]);
}
```

##### 5. useDropZone Hook (`useDropZone.ts`)

```typescript
import { useCallback, useMemo, useState, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useDragDropStore } from './store';
import { DragData, DragDataType, DropZoneConfig } from './types';
import { deserializeDragData, hasExternalFiles, extractFiles } from './serialization';

/**
 * Hook to create a drop zone with type-safe handling
 * 
 * @example
 * // Canvas drop zone
 * const Canvas = () => {
 *   const dropProps = useDropZone({
 *     accepts: ['create-node', 'asset', 'file'],
 *     useFlowPosition: true,
 *     onDrop: async (data, event, position) => {
 *       if (data.type === 'create-node') {
 *         createNode(data.payload, position);
 *       }
 *     }
 *   });
 *   
 *   return (
 *     <div 
 *       {...dropProps} 
 *       className={`canvas ${dropProps.isOver ? 'drag-over' : ''}`}
 *     />
 *   );
 * };
 */
export function useDropZone<T extends DragDataType = DragDataType>(
  config:  DropZoneConfig<T>
) {
  const [isOver, setIsOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);
  const activeDrag = useDragDropStore((s) => s.activeDrag);
  const dragCounter = useRef(0); // Track nested drag enter/leave
  
  // Optional ReactFlow integration
  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    reactFlow = useReactFlow();
  } catch {
    // Not in ReactFlow context - that's fine
  }

  const getPosition = useCallback((event: React. DragEvent) => {
    if (config.useFlowPosition && reactFlow) {
      return reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
    }
    return { x: event.clientX, y: event.clientY };
  }, [config.useFlowPosition, reactFlow]);

  const checkCanDrop = useCallback(async (
    data: DragData | null,
    event: React. DragEvent
  ): Promise<boolean> => {
    // Check for external files
    if (hasExternalFiles(event.dataTransfer)) {
      const acceptsFiles = config.accepts.includes('file' as T);
      return acceptsFiles;
    }
    
    if (!data) return false;
    
    // Type check
    if (! config.accepts.includes(data.type as T)) {
      return false;
    }
    
    // Custom validation
    if (config.validate) {
      return await config.validate(data as DragData<T>, event);
    }
    
    return true;
  }, [config]);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current++;
    
    if (dragCounter.current === 1) {
      setIsOver(true);
    }
  }, []);

  const handleDragOver = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    
    if (config.disabled) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }

    const valid = await checkCanDrop(activeDrag, event);
    setCanDrop(valid);
    event.dataTransfer.dropEffect = valid ? 'move' : 'none';
  }, [activeDrag, checkCanDrop, config.disabled]);

  const handleDragLeave = useCallback((event: React. DragEvent) => {
    event.preventDefault();
    dragCounter.current--;
    
    if (dragCounter.current === 0) {
      setIsOver(false);
      setCanDrop(false);
    }
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    dragCounter.current = 0;
    setIsOver(false);
    setCanDrop(false);
    
    if (config.disabled) return;

    const position = getPosition(event);

    // Handle external files first
    if (hasExternalFiles(event.dataTransfer) && config.accepts.includes('file' as T)) {
      const files = extractFiles(event.dataTransfer);
      for (const file of files) {
        await config.onDrop(
          { type: 'file', payload:  file } as DragData<T>,
          event,
          position
        );
      }
      return;
    }

    // Handle internal drag data
    const data = deserializeDragData(event.dataTransfer);
    if (!data) return;
    
    if (! config.accepts.includes(data. type as T)) return;
    
    // Validate
    if (config.validate && !(await config.validate(data as DragData<T>, event))) {
      return;
    }

    await config.onDrop(data as DragData<T>, event, position);
  }, [config, getPosition]);

  // Build className
  const className = useMemo(() => {
    const classes:  string[] = [];
    if (isOver && config.activeClassName) {
      classes.push(config.activeClassName);
    }
    if (isOver && canDrop && config.validClassName) {
      classes.push(config.validClassName);
    }
    return classes.join(' ') || undefined;
  }, [isOver, canDrop, config.activeClassName, config.validClassName]);

  return useMemo(() => ({
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    isOver,
    canDrop,
    className,
    'data-dropzone': true
  }), [handleDragEnter, handleDragOver, handleDragLeave, handleDrop, isOver, canDrop, className]);
}
```

##### 6. Index Export (`index.ts`)

```typescript
// Types
export type {
  DragDataType,
  DragPayloadMap,
  DragData,
  DragMetadata,
  DropZoneConfig,
  DraggableOptions,
  DragImageConfig,
  DragDropState
} from './types';

// Store
export { useDragDropStore } from './store';

// Hooks
export { useDraggable } from './useDraggable';
export { useDropZone } from './useDropZone';

// Utilities
export {
  serializeDragData,
  deserializeDragData,
  hasExternalFiles,
  extractFiles,
  createDragCountBadge,
  DRAG_DATA_MIME
} from './serialization';
```

---

#### Phase 2: Migration Strategy

##### Migration Priority Order:

1. **Canvas Drop (`useDropHandler.ts`)** - Most complex, highest impact
2. **Asset Dragging (`useAssetActions.ts`)** - Used in multiple places
3. **Chat Drag & Drop (`useDragAndDrop.ts`)** - Simpler use case
4. **File Property Inputs (`useFileDrop.ts`)** - Type-specific validation
5. **Collection Drag & Drop (`useCollectionDragAndDrop.ts`)** - Standalone feature

**Note:** `useDragHandlers.ts` handles ReactFlow-internal node dragging (grouping/ungrouping) and should NOT be migrated—it uses different mechanics.

##### Example Migration:  Canvas Drop Handler

**Create new hook alongside existing:**

```typescript
// web/src/hooks/handlers/useCanvasDropZone.ts
import { useCallback } from 'react';
import { useDropZone, DragData } from '../../lib/dragdrop';
import { useNodes } from '../../contexts/NodeContext';
import { useAddNodeFromAsset } from './addNodeFromAsset';
import { useFileHandlers } from './dropHandlerUtils';
import { useNotificationStore } from '../../stores/NotificationStore';
import { useAssetStore } from '../../stores/AssetStore';
import useAuth from '../../stores/useAuth';
import { Asset, NodeMetadata } from '../../stores/ApiTypes';

const MULTI_NODE_HORIZONTAL_SPACING = 250;
const MULTI_NODE_VERTICAL_SPACING = 250;
const NODES_PER_ROW = 2;

export function useCanvasDropZone() {
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));
  const getAsset = useAssetStore((state) => state.get);
  const { user } = useAuth();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const addNodeFromAsset = useAddNodeFromAsset();
  const { handlePngFile, handleJsonFile, handleCsvFile, handleGenericFile } = useFileHandlers();

  const handleDrop = useCallback(async (
    data: DragData,
    event: React.DragEvent,
    position?:  { x: number; y: number }
  ) => {
    if (!position) return;

    switch (data.type) {
      case 'create-node':  {
        const metadata = data.payload as NodeMetadata;
        const newNode = createNode(metadata, position);
        addNode(newNode);
        break;
      }
      
      case 'asset': {
        const asset = data.payload as Asset;
        const fullAsset = await getAsset(asset. id);
        addNodeFromAsset(fullAsset, position);
        break;
      }
      
      case 'assets-multiple': {
        const assetIds = data.payload as string[];
        assetIds.forEach((assetId, index) => {
          const offsetX = (index % NODES_PER_ROW) * MULTI_NODE_HORIZONTAL_SPACING;
          const offsetY = Math.floor(index / NODES_PER_ROW) * MULTI_NODE_VERTICAL_SPACING;
          const nodePosition = {
            x: position.x + offsetX,
            y: position.y + offsetY
          };
          getAsset(assetId).then((asset) => {
            addNodeFromAsset(asset, nodePosition);
          });
        });
        break;
      }
      
      case 'file':  {
        if (! user) return;
        const file = data.payload as File;
        const result = await handleFile(file, position);
        if (! result. success) {
          addNotification({
            type: 'error',
            content: `Failed to process file: ${result.error}`,
            alert: true
          });
        }
        break;
      }
    }
  }, [createNode, addNode, getAsset, addNodeFromAsset, user, addNotification]);

  // Helper to handle files based on type
  const handleFile = useCallback(async (file: File, position: { x: number; y: number }) => {
    switch (file.type) {
      case 'image/png':
        return handlePngFile(file, position);
      case 'application/json':
        return handleJsonFile(file, position);
      case 'text/csv': 
        return handleCsvFile(file, position);
      default:
        return handleGenericFile(file, position);
    }
  }, [handlePngFile, handleJsonFile, handleCsvFile, handleGenericFile]);

  const dropZoneProps = useDropZone({
    accepts: ['create-node', 'asset', 'assets-multiple', 'file'],
    useFlowPosition: true,
    onDrop: handleDrop,
    validate: (data, event) => {
      // Only allow drops on the pane, not on nodes
      const target = event.target as HTMLElement;
      return target.classList.contains('react-flow__pane');
    },
    activeClassName: 'canvas-drag-over',
    validClassName:  'canvas-drop-valid'
  });

  return dropZoneProps;
}
```

##### Add Deprecation Warnings to Old Hooks: 

```typescript
// In useDropHandler.ts, add at the top:
/**
 * @deprecated Use useCanvasDropZone from lib/dragdrop instead. 
 * This hook will be removed in a future version.
 */
export const useDropHandler = () => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      'useDropHandler is deprecated. Please migrate to useCanvasDropZone from lib/dragdrop.'
    );
  }
  // ... existing implementation
};
```

---

#### Phase 3: CSS Integration

Create `web/src/lib/dragdrop/dragdrop.css`:

```css
/* Drop zone visual feedback */
[data-dropzone] {
  transition: box-shadow 0.2s ease, background-color 0.2s ease;
}

/* Global drag-over styling */
. canvas-drag-over:: after,
.drag-over::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-color: rgba(var(--palette-primary-main-channel, 99, 102, 241), 0.05);
  border: 2px dashed rgba(var(--palette-primary-main-channel, 99, 102, 241), 0.3);
  border-radius: 4px;
  z-index: 1000;
}

. canvas-drop-valid:: after,
.drop-valid::after {
  background-color: rgba(var(--palette-success-main-channel, 34, 197, 94), 0.1);
  border-color: rgba(var(--palette-success-main-channel, 34, 197, 94), 0.5);
}

/* Draggable cursor states */
[draggable="true"] {
  cursor: grab;
  user-select: none;
}

[draggable="true"]: active {
  cursor: grabbing;
}

/* Asset folder drop hover state */
.asset-folder-drop-hover {
  background-color: rgba(var(--palette-primary-main-channel), 0.15) !important;
  border:  2px solid var(--palette-primary-main) !important;
}
```

Import in `web/src/index.tsx`:

```typescript
// Near the top with other style imports
import './lib/dragdrop/dragdrop.css';
```

---

#### Phase 4: Testing Strategy

Create `web/src/lib/dragdrop/__tests__/`:

##### `serialization.test.ts`

```typescript
import { 
  serializeDragData, 
  deserializeDragData, 
  hasExternalFiles,
  DRAG_DATA_MIME 
} from '../serialization';

describe('serialization', () => {
  describe('serializeDragData', () => {
    it('should serialize create-node data with both new and legacy formats', () => {
      const mockDataTransfer = {
        setData: jest.fn()
      } as unknown as DataTransfer;
      
      const data = {
        type: 'create-node' as const,
        payload: { node_type: 'test. Node', title: 'Test' }
      };
      
      serializeDragData(data, mockDataTransfer);
      
      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        DRAG_DATA_MIME,
        expect.any(String)
      );
      expect(mockDataTransfer.setData).toHaveBeenCalledWith(
        'create-node',
        expect.any(String)
      );
    });
  });
  
  describe('deserializeDragData', () => {
    it('should prefer new format over legacy', () => {
      const mockDataTransfer = {
        getData: jest.fn((key) => {
          if (key === DRAG_DATA_MIME) {
            return JSON.stringify({
              type: 'create-node',
              payload: { node_type: 'new.Node' }
            });
          }
          if (key === 'create-node') {
            return JSON.stringify({ node_type: 'legacy.Node' });
          }
          return '';
        })
      } as unknown as DataTransfer;
      
      const result = deserializeDragData(mockDataTransfer);
      
      expect(result?. payload).toEqual({ node_type: 'new.Node' });
    });
    
    it('should fall back to legacy format', () => {
      const mockDataTransfer = {
        getData:  jest.fn((key) => {
          if (key === 'create-node') {
            return JSON.stringify({ node_type: 'legacy.Node' });
          }
          return '';
        })
      } as unknown as DataTransfer;
      
      const result = deserializeDragData(mockDataTransfer);
      
      expect(result?.type).toBe('create-node');
      expect(result?.payload).toEqual({ node_type: 'legacy.Node' });
    });
  });
});
```

##### `hooks.test.tsx`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useDraggable } from '../useDraggable';
import { useDropZone } from '../useDropZone';
import { useDragDropStore } from '../store';

// Reset store between tests
beforeEach(() => {
  useDragDropStore.setState({ activeDrag: null, isDragging: false });
});

describe('useDraggable', () => {
  it('should return draggable props', () => {
    const { result } = renderHook(() => 
      useDraggable({
        type: 'create-node',
        payload: { node_type:  'test.Node' }
      })
    );
    
    expect(result.current.draggable).toBe(true);
    expect(result. current['data-drag-type']).toBe('create-node');
  });
  
  it('should update store on drag start', () => {
    const { result } = renderHook(() => 
      useDraggable({
        type: 'asset',
        payload: { id: '123', name: 'test' }
      })
    );
    
    const mockEvent = {
      dataTransfer:  {
        setData: jest. fn(),
        effectAllowed: ''
      }
    } as unknown as React.DragEvent;
    
    act(() => {
      result.current.onDragStart(mockEvent);
    });
    
    expect(useDragDropStore.getState().isDragging).toBe(true);
    expect(useDragDropStore. getState().activeDrag?.type).toBe('asset');
  });
});

describe('useDropZone', () => {
  it('should return drop zone props', () => {
    const onDrop = jest.fn();
    const { result } = renderHook(() => 
      useDropZone({
        accepts: ['create-node'],
        onDrop
      })
    );
    
    expect(result.current['data-dropzone']).toBe(true);
    expect(result.current.isOver).toBe(false);
  });
});
```

---

#### Phase 5: Documentation

Create `web/src/lib/dragdrop/README.md`:

````markdown
# Drag & Drop Library

Unified, type-safe drag and drop system for NodeTool. 

## Quick Start

### Making an Element Draggable

```tsx
import { useDraggable } from '@/lib/dragdrop';

const NodeMenuItem = ({ node }: { node: NodeMetadata }) => {
  const dragProps = useDraggable({
    type: 'create-node',
    payload: node
  });
  
  return (
    <div {...dragProps} className="node-item">
      {node.title}
    </div>
  );
};
```

### Creating a Drop Zone

```tsx
import { useDropZone } from '@/lib/dragdrop';

const Canvas = () => {
  const dropProps = useDropZone({
    accepts: ['create-node', 'asset', 'file'],
    useFlowPosition:  true, // Converts to ReactFlow coordinates
    onDrop: async (data, event, position) => {
      switch (data.type) {
        case 'create-node': 
          createNode(data.payload, position);
          break;
        case 'asset':
          addAssetNode(data.payload, position);
          break;
        case 'file':
          uploadAndCreateNode(data.payload, position);
          break;
      }
    }
  });
  
  return (
    <div {... dropProps} className={dropProps.className}>
      {/* Canvas content */}
    </div>
  );
};
```

### With Custom Drag Image

```tsx
const AssetItem = ({ asset, selectedCount }) => {
  const dragProps = useDraggable(
    { type: 'asset', payload:  asset },
    { dragImage: { count: selectedCount } }
  );
  
  return <div {...dragProps}>{asset.name}</div>;
};
```

## Migration Guide

See the migration examples in this directory for converting existing hooks. 

### Before (Old Pattern)
```tsx
const handleDragStart = (e: React.DragEvent) => {
  e.dataTransfer.setData('asset', JSON.stringify(asset));
  e.dataTransfer.effectAllowed = 'move';
};
```

### After (New Pattern)
```tsx
const dragProps = useDraggable({
  type: 'asset',
  payload: asset
});
// Use dragProps on element
```

## Type Safety

The library provides full TypeScript support with typed payloads:

```typescript
interface DragPayloadMap {
  'create-node': NodeMetadata;
  'asset': Asset;
  'assets-multiple': string[];
  'file': File;
  'tab':  string;
}
```
````

---

### Revised Acceptance Criteria

- [ ] All new files created in `web/src/lib/dragdrop/`
- [ ] Zustand store created (not Context) for consistency with app patterns
- [ ] **Backward compatibility** maintained via legacy key serialization
- [ ] At least 2 existing implementations migrated with deprecation warnings
- [ ] Unit tests with >80% coverage for core utilities
- [ ] CSS file integrated into app entry
- [ ] `useDragHandlers.ts` **NOT** touched (ReactFlow-specific)
- [ ] TypeScript strict mode passes
- [ ] Documentation with migration guide complete
- [ ] All existing drag & drop features verified working

### Key Differences from Original Plan

1. **Uses Zustand instead of React Context** - Matches existing state management patterns
2. **Backward compatibility via dual serialization** - Sets both new and legacy dataTransfer keys
3. **Excludes `useDragHandlers.ts`** - This handles ReactFlow node grouping, which is unrelated
4. **More specific type definitions** - `DragPayloadMap` provides compile-time type safety
5. **Practical migration strategy** - Side-by-side implementation with deprecation warnings
6. **Realistic scope** - Focuses on data transfer standardization, not ReactFlow internals
