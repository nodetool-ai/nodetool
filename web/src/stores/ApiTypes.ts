export type {
  Node_Input as Node,
  Edge,
  Graph_Input as Graph,
  AssetList,
  AssetRef,
  AssetUpdateRequest,
  ImageRef,
  ImageRef as Image,
  DataframeRef,
  ColumnDef,
  AudioRef,
  AudioRef as Audio,
  VideoRef,
  VideoRef as Video,
  Model3DRef,
  NPArray,
  TextRef,
  WorkflowRef,
  NodeRef,
  Workflow,
  WorkflowList,
  WorkflowTool,
  WorkflowToolList,
  WorkflowRequest,
  Property,
  OutputSlot,
  NodeMetadata as BaseNodeMetadata,
  IndexResponse,
  TypeMetadata_Input as TypeMetadata,
  Message,
  Prediction,
  MessageCreateRequest,
  MessageList,
  MessageTextContent,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent,
  MessageDocumentContent,
  DocumentRef,
  DocumentRef as Document,
  FolderRef,
  FontRef,
  RunJobRequest,
  ResourceLimits,
  NodeUpdate,
  OutputUpdate,
  NodeProgress,
  PreviewUpdate,
  TaskUpdate,
  JobUpdate,
  LlamaModel,
  LanguageModel,
  EmbeddingModel,
  ImageModel,
  TTSModel,
  ASRModel,
  VideoModel,
  HuggingFaceModel,
  SystemStats,
  ToolCall,
  ToolCallUpdate,
  ToolResultUpdate,
  Chunk,
  SVGElement,
  RepoPath,
  NodetoolApiFileFileInfo as FileInfo,
  NodetoolApiWorkspaceFileInfo as WorkspaceFileInfo,
  NodetoolApiCollectionCollectionResponse as CollectionResponse,
  NodetoolApiCollectionCollectionList as CollectionList,
  NodetoolApiCollectionCollectionCreate as CollectionCreate,
  Task,
  TaskPlan,
  Step,
  StepResult,
  PlotlyConfig,
  PlanningUpdate,
  InferenceProvider,
  Provider,
  ProviderInfo,
  Thread,
  ThreadCreateRequest,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  ThreadList,
  EdgeUpdate,
  Notification,
  LogUpdate,
  Error as ErrorMessage,
  SecretResponse,
  JobResponse,
  JobResponse as Job,
  JobListResponse,
  CalendarEvent,
  Datetime,
  ModelPack,
  WorkspaceResponse,
  WorkspaceListResponse,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
  SettingWithValue
} from "./BaseTypes";

import type {
  Asset as AssetBase,
  NodeMetadata as BaseNodeMetadataType,
  UnifiedModel as UnifiedModelBase,
  Provider,
  ModelPack,
  Workflow,
  Graph_Input,
  MessageTextContent,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent,
  MessageDocumentContent
} from "./BaseTypes";

export type Asset = Omit<AssetBase, "size"> & {
  size?: number | null; // File size in bytes - added for size sorting
};

// New types for global search functionality
export interface AssetWithPath extends Asset {
  folder_name: string;
  folder_path: string;
  folder_id: string;
}

export interface AssetSearchResult {
  assets: AssetWithPath[];
  next_cursor?: string;
  total_count: number;
  is_global_search: boolean;
}

// Workflow version types using API schema types
export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  created_at: string;
  name?: string;
  description?: string;
  is_pinned?: boolean;
  save_type?: "manual" | "autosave" | "checkpoint" | "restore";
  graph: Graph_Input;
}

export interface WorkflowVersionList {
  versions: WorkflowVersion[];
  next: string | null;
}

export interface CreateWorkflowVersionRequest {
  name?: string;
  description?: string;
}

export interface NodeMetadata extends BaseNodeMetadataType {
  searchInfo?: {
    score?: number;
    matches?: Array<{
      key: string;
      value: string;
      indices: number[][];
    }>;
  };
  model_packs?: ModelPack[];
}

export type UnifiedModel = UnifiedModelBase & {
  artifact_family?: string | null;
  artifact_component?: string | null;
  artifact_confidence?: number | null;
  artifact_evidence?: string[] | null;
};

// Model property value types for use in component onChange handlers
// These types represent the actual values passed to property onChange callbacks

/**
 * Property value for Llama model selections in node properties.
 * Used by LlamaModelSelect component onChange handlers.
 */
export interface LlamaModelValue {
  type: "llama_model";
  repo_id: string;
}

/**
 * Property value for Language model selections in node properties.
 * Used by LanguageModelSelect component onChange handlers.
 */
export interface LanguageModelValue {
  type: "language_model";
  id: string;
  provider: Provider;
  name: string;
}

/**
 * Property value for Image model selections in node properties.
 * Used by ImageModelSelect component onChange handlers.
 */
export interface ImageModelValue {
  type: "image_model";
  id: string;
  provider: Provider;
  name: string;
  path: string;
}

/**
 * Property value for TTS model selections in node properties.
 * Used by TTSModelSelect component onChange handlers.
 */
export interface TTSModelValue {
  type: "tts_model";
  id: string;
  provider: Provider;
  name: string;
  voices: string[];
  selected_voice: string;
}

// a type that allows arbitrary members
export type TypeName = string;
export type WorkflowAttributes = Omit<Workflow, "graph">;
export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageVideoContent
  | MessageAudioContent
  | MessageDocumentContent;

// Resource change update type for WebSocket notifications
export interface ResourceChangeUpdate {
  type: "resource_change";
  event: "created" | "updated" | "deleted";
  resource_type: string; // e.g. "workflow", "asset", "thread", "job"
  resource: {
    id: string;
    etag?: string;
    [key: string]: unknown; // Additional resource properties
  };
}
