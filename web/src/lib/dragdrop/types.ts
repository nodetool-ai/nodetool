/**
 * Unified Drag & Drop Type Definitions
 *
 * Provides type-safe drag and drop operations across the application.
 * Maps to existing dataTransfer keys for backward compatibility.
 */

import type {
  Asset,
  NodeMetadata,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent
} from "../../stores/ApiTypes";

/**
 * Supported drag data types in the application.
 * Maps to existing dataTransfer keys for backward compatibility.
 */
export type DragDataType =
  | "create-node" // Node from node menu (maps to existing "create-node" key)
  | "asset" // Single asset (maps to existing "asset" key)
  | "assets-multiple" // Multiple assets (maps to existing "selectedAssetIds" key)
  | "sketch" // Persisted sketch document from sketch panel
  | "timeline" // Persisted timeline sequence from timeline panel
  | "file" // External file from OS
  | "tab" // Editor tab reordering
  | "collection-file" // File being added to collection
  | "chat-media"; // Generated media block dragged out of the chat view

/** A single image/video/audio block from a chat message, draggable to canvas. */
export type ChatMediaDragPayload =
  | MessageImageContent
  | MessageVideoContent
  | MessageAudioContent;

/**
 * Type-safe payload definitions for each drag type
 */
export interface SketchDragPayload {
  id: string;
  name: string;
  updatedAt?: string;
}

export interface TimelineDragPayload {
  id: string;
  name: string;
  updatedAt?: string;
}

export interface DragPayloadMap {
  "create-node": NodeMetadata;
  asset: Asset;
  "assets-multiple": string[]; // Asset IDs
  sketch: SketchDragPayload;
  timeline: TimelineDragPayload;
  file: File;
  tab: string; // Workflow ID
  "collection-file": File;
  "chat-media": ChatMediaDragPayload;
}

/**
 * Structured drag data with compile-time type safety
 */
export interface DragData<T extends DragDataType = DragDataType> {
  type: T;
  payload: DragPayloadMap[T];
  metadata?: DragMetadata;
}

export interface DragMetadata {
  sourceId?: string;
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
  onDrop: (
    data: DragData<T>,
    event: React.DragEvent,
    position?: { x: number; y: number }
  ) => void | Promise<void>;

  /** Optional validation beyond type checking */
  validate?: (
    data: DragData<T>,
    event: React.DragEvent
  ) => boolean | Promise<boolean>;

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
  onDragStart?: (event: React.DragEvent) => void;

  /** Called when drag ends */
  onDragEnd?: (event: React.DragEvent) => void;

  /** Disable dragging */
  disabled?: boolean;

  /** Drop effect to show */
  effectAllowed?: DataTransfer["effectAllowed"];
}

export interface DragImageConfig {
  /** Badge showing count */
  count?: number;
  /** Custom content to show */
  content?: string;
  /** Position offset */
  offset?: { x: number; y: number };
}

/**
 * Global drag state exposed through store
 */
export interface DragDropState {
  /** Currently active drag data (null when not dragging) */
  activeDrag: DragData | null;

  /** Whether any drag operation is in progress */
  isDragging: boolean;
}
