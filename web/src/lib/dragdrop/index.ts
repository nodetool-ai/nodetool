/**
 * Unified Drag & Drop Library
 *
 * Provides type-safe drag and drop operations across the application.
 */

// Types
export type {
  DragDataType,
  DragPayloadMap,
  ChatMediaDragPayload,
  SketchDragPayload,
  TimelineDragPayload,
  DragData,
  DragMetadata,
  DropZoneConfig,
  DraggableOptions,
  DragImageConfig,
  DragDropState
} from "./types";

// Store
export { useDragDropStore } from "./store";

// Hooks
export { useDraggable } from "./useDraggable";
export { useDropZone } from "./useDropZone";

// Utilities
export {
  serializeDragData,
  deserializeDragData,
  hasExternalFiles,
  extractFiles,
  createDragCountBadge,
  DRAG_DATA_MIME
} from "./serialization";

export { createAssetDragImage } from "./dragImage";
