/**
 * Unified Drag & Drop Type Definitions
 *
 * Provides type-safe drag and drop operations across the application.
 * Maps to existing dataTransfer keys for backward compatibility.
 */

import type { ExampleModel } from "../../utils/exampleModels";
import type {
  Asset,
  Graph,
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
  | "chat-media" // Generated media block dragged out of the chat view
  | "example-model" // Shipped glTF example model from the Examples panel
  | "example-sketch" // Shipped example sketch, installed on drop
  | "example-timeline" // Shipped example timeline, installed on drop
  | "example-storyboard" // Shipped example storyboard, installed on drop
  | "example-workflow"; // Shipped example workflow, its nodes pasted on drop

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

/** A shipped example that is copied into the project when it is dropped. */
export interface ExampleDocumentDragPayload {
  slug: string;
  name: string;
}

/** A shipped example workflow, whose graph is pasted onto the canvas. */
export interface ExampleWorkflowDragPayload {
  name: string;
  graph: Graph;
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
  "example-model": ExampleModel;
  "example-sketch": ExampleDocumentDragPayload;
  "example-timeline": ExampleDocumentDragPayload;
  "example-storyboard": ExampleDocumentDragPayload;
  "example-workflow": ExampleWorkflowDragPayload;
}

interface DragDataFor<T extends DragDataType> {
  type: T;
  payload: DragPayloadMap[T];
  metadata?: DragMetadata;
}

/**
 * Structured drag data with compile-time type safety.
 *
 * Written as a union over the accepted types rather than one interface
 * parameterised by them, so that `type` discriminates `payload`: a consumer
 * that checks `data.type === "asset"` gets an `Asset` payload without an
 * assertion.
 */
export type DragData<T extends DragDataType = DragDataType> = {
  [K in T]: DragDataFor<K>;
}[T];

export interface DragMetadata {
  sourceId?: string;
  sourceName?: string;
  count?: number;
  thumbnailUrl?: string;
  /**
   * Full Asset objects for an "assets-multiple" drag, captured at drag-start
   * time. Consumers should prefer this over looking assets up by id in an
   * AssetGridStore, since the store that produced the drag (a scoped
   * sidebar panel) may not be the same store instance the drop target reads
   * from.
   */
  assets?: Asset[];
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
 * Global drag state exposed through store
 */
export interface DragDropState {
  /** Currently active drag data (null when not dragging) */
  activeDrag: DragData | null;

  /** Whether any drag operation is in progress */
  isDragging: boolean;
}
