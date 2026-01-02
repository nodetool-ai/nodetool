# Drag & Drop Library

Unified, type-safe drag and drop system for NodeTool.

## Quick Start

### Making an Element Draggable

```tsx
import { useDraggable } from "@/lib/dragdrop";

const NodeMenuItem = ({ node }: { node: NodeMetadata }) => {
  const dragProps = useDraggable({
    type: "create-node",
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
import { useDropZone } from "@/lib/dragdrop";

const Canvas = () => {
  const dropProps = useDropZone({
    accepts: ["create-node", "asset", "file"],
    useFlowPosition: true, // Converts to ReactFlow coordinates
    onDrop: async (data, event, position) => {
      switch (data.type) {
        case "create-node":
          createNode(data.payload, position);
          break;
        case "asset":
          addAssetNode(data.payload, position);
          break;
        case "file":
          uploadAndCreateNode(data.payload, position);
          break;
      }
    }
  });

  return (
    <div {...dropProps} className={dropProps.className}>
      {/* Canvas content */}
    </div>
  );
};
```

### With Custom Drag Image

```tsx
const AssetItem = ({ asset, selectedCount }) => {
  const dragProps = useDraggable(
    { type: "asset", payload: asset },
    { dragImage: { count: selectedCount } }
  );

  return <div {...dragProps}>{asset.name}</div>;
};
```

### Accessing Global Drag State

```tsx
import { useDragDropStore } from "@/lib/dragdrop";

const DropIndicator = () => {
  const isDragging = useDragDropStore((s) => s.isDragging);
  const activeDrag = useDragDropStore((s) => s.activeDrag);

  if (!isDragging) return null;

  return (
    <div className="drop-indicator">
      Dragging: {activeDrag?.type}
    </div>
  );
};
```

## Migration Guide

### Before (Old Pattern)

```tsx
const handleDragStart = (e: React.DragEvent) => {
  e.dataTransfer.setData("asset", JSON.stringify(asset));
  e.dataTransfer.effectAllowed = "move";
};
```

### After (New Pattern)

```tsx
const dragProps = useDraggable({
  type: "asset",
  payload: asset
});
// Use dragProps on element
```

## Type Safety

The library provides full TypeScript support with typed payloads:

```typescript
interface DragPayloadMap {
  "create-node": NodeMetadata;
  asset: Asset;
  "assets-multiple": string[];
  file: File;
  tab: string;
}
```

## Backward Compatibility

The library maintains backward compatibility with existing code by:

1. **Dual serialization**: Both new and legacy dataTransfer keys are set
2. **Fallback deserialization**: Legacy keys are read if new format is not present
3. **Gradual migration**: Components can be migrated incrementally

## API Reference

### useDraggable

```typescript
function useDraggable<T extends DragDataType>(
  data: DragData<T>,
  options?: DraggableOptions
): {
  draggable: boolean;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
  "data-drag-type": string;
};
```

### useDropZone

```typescript
function useDropZone<T extends DragDataType>(
  config: DropZoneConfig<T>
): {
  onDragEnter: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  isOver: boolean;
  canDrop: boolean;
  className: string | undefined;
  "data-dropzone": boolean;
};
```

### useDragDropStore

```typescript
interface DragDropStore {
  activeDrag: DragData | null;
  isDragging: boolean;
  setActiveDrag: (data: DragData | null) => void;
  clearDrag: () => void;
}
```
