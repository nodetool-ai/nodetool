// Re-exports from @nodetool/protocol plus frontend-specific extensions.
// This file is a compatibility shim — new code should import from
// @nodetool/protocol directly whenever possible.

import {
  Asset as ProtocolAsset,
  AssetList,
  AssetRef,
  AssetUpdateRequest,
  ASRModel,
  AudioRef,
  CalendarEvent,
  ChartConfig,
  ChartData,
  ChartSeries,
  Chunk,
  CollectionCreate,
  CollectionList,
  CollectionResponse,
  ColumnDef,
  CreateWorkflowVersionRequest,
  DataframeRef,
  Datetime,
  DocumentRef,
  Edge,
  EdgeUpdate,
  EmbeddingModel,
  ErrorMessage,
  FileInfo,
  FolderRef,
  FontRef,
  HuggingFaceModel,
  ImageModel,
  ImageRef,
  IndexResponse,
  InferenceProvider,
  JobListResponse,
  JobResponse,
  JobUpdate,
  LanguageModel,
  LlamaModel,
  LogUpdate,
  MediaGenerationMode,
  MediaGenerationRequest,
  Message,
  MessageAudioContent,
  MessageCreateRequest,
  MessageDocumentContent,
  MessageImageContent,
  MessageImageUrlContent,
  MessageList,
  MessageTextContent,
  MessageThoughtContent,
  MessageVideoContent,
  Model3DRef,
  ModelPack,
  Node,
  NodeMetadata as BaseNodeMetadataFromProtocol,
  NodeProgress,
  NodeUpdate,
  Notification,
  NPArray,
  OutputSlot,
  OutputUpdate,
  PlanningUpdate,
  PlotlyConfig,
  Prediction,
  PreviewUpdate,
  Property,
  PropertyTypeMetadata,
  Provider,
  ProviderInfo,
  RepoPath,
  ResourceChangeMessage,
  ResourceLimits,
  RunJobRequest,
  RunStateInfo,
  SecretResponse,
  SettingWithValue,
  SettingsResponse,
  SettingsUpdateRequest,
  Step,
  StepResult,
  SVGElement,
  SystemStats,
  Task,
  TaskPlan,
  TaskUpdate,
  TextRef,
  Thread,
  ThreadCreateRequest,
  ThreadList,
  ThreadSummarizeRequest,
  ThreadUpdateRequest,
  ToolCall,
  ToolCallUpdate,
  ToolResultUpdate,
  TTSModel,
  UnifiedModel as ProtocolUnifiedModel,
  VideoModel,
  VideoRef,
  Workflow,
  WorkflowGraph,
  WorkflowList,
  WorkflowRef,
  WorkflowRequest,
  WorkflowTool,
  WorkflowToolList,
  WorkflowVersion,
  WorkflowVersionList,
  WorkflowVersionSaveType,
  WorkspaceCreateRequest,
  WorkspaceFileInfo,
  WorkspaceListResponse,
  WorkspaceResponse,
  WorkspaceUpdateRequest
} from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// Re-exports (alphabetical)
// ---------------------------------------------------------------------------

export type { AssetList };
export type { AssetRef };
export type { AssetUpdateRequest };
export type { ASRModel };
export type { AudioRef };
export type { CalendarEvent };
export type { ChartConfig };
export type { ChartData };
export type { ChartSeries };
export type { CollectionCreate };
export type { CollectionList };
export type { CollectionResponse };
export type { Chunk };
export type { ColumnDef };
export type { CreateWorkflowVersionRequest };
export type { DataframeRef };
export type { Datetime };
export type { DocumentRef };
export type { Edge };
export type { EdgeUpdate };
export type { EmbeddingModel };
export type { ErrorMessage };
export type { FileInfo };
export type { FolderRef };
export type { FontRef };
export type { HuggingFaceModel };
export type { ImageModel };
export type { ImageRef };
export type { IndexResponse };
export type { InferenceProvider };
export type { JobListResponse };
export type { JobResponse };
export type { JobUpdate };
export type { LanguageModel };
export type { LlamaModel };
export type { LogUpdate };
export type { MediaGenerationMode };
export type { MediaGenerationRequest };
export type { Message };
export type { MessageAudioContent };
export type { MessageCreateRequest };
export type { MessageDocumentContent };
export type { MessageImageContent };
export type { MessageImageUrlContent };
export type { MessageList };
export type { MessageTextContent };
export type { MessageThoughtContent };
export type { MessageVideoContent };
export type { Model3DRef };
export type { ModelPack };
export type { Node };
export type { NodeProgress };
export type { NodeUpdate };
export type { Notification };
export type { NPArray };
export type { OutputSlot };
export type { OutputUpdate };
export type { PlanningUpdate };
export type { PlotlyConfig };
export type { Prediction };
export type { PreviewUpdate };
export type { Property };
export type { PropertyTypeMetadata };
export type { Provider };
export type { ProviderInfo };
export type { RepoPath };
export type { ResourceChangeMessage };
export type { ResourceLimits };
export type { RunJobRequest };
export type { RunStateInfo };
export type { SecretResponse };
export type { SettingWithValue };
export type { SettingsResponse };
export type { SettingsUpdateRequest };
export type { Step };
export type { StepResult };
export type { SVGElement };
export type { SystemStats };
export type { Task };
export type { TaskPlan };
export type { TaskUpdate };
export type { TextRef };
export type { Thread };
export type { ThreadCreateRequest };
export type { ThreadList };
export type { ThreadSummarizeRequest };
export type { ThreadUpdateRequest };
export type { ToolCall };
export type { ToolCallUpdate };
export type { ToolResultUpdate };
export type { TTSModel };
export type { VideoModel };
export type { VideoRef };
export type { Workflow };
export type { WorkflowGraph };
export type { WorkflowList };
export type { WorkflowRef };
export type { WorkflowRequest };
export type { WorkflowTool };
export type { WorkflowToolList };
export type { WorkflowVersion };
export type { WorkflowVersionList };
export type { WorkflowVersionSaveType };
export type { WorkspaceCreateRequest };
export type { WorkspaceFileInfo };
export type { WorkspaceListResponse };
export type { WorkspaceResponse };
export type { WorkspaceUpdateRequest };

// ---------------------------------------------------------------------------
// Aliases for backward compatibility
// ---------------------------------------------------------------------------

/** Alias for AudioRef */
export type Audio = AudioRef;
/** Alias for DocumentRef */
export type Document = DocumentRef;
/** Alias for ImageRef */
export type Image = ImageRef;
/** Alias for VideoRef */
export type Video = VideoRef;
/** Alias for JobResponse */
export type Job = JobResponse;
/** Alias for WorkflowGraph */
export type Graph = WorkflowGraph;
/** Shorthand for any string type name */
export type TypeName = string;

/** Re-export base metadata shape under its old name */
export type BaseNodeMetadata = BaseNodeMetadataFromProtocol;

// ---------------------------------------------------------------------------
// Local overrides / extensions
// ---------------------------------------------------------------------------

/** Asset with the size field guaranteed present (used for sorting) */
export interface Asset extends ProtocolAsset {
  size?: number | null;
}

/** UnifiedModel — re-declared so we can tighten `type` to required if needed.
 *  Currently just mirrors the protocol shape. */
export interface UnifiedModel extends ProtocolUnifiedModel {}

/** Frontend-enriched node metadata (search info, runtime hints, etc.) */
export interface NodeMetadata extends BaseNodeMetadata {
  searchInfo?: {
    score?: number;
    matches?: Array<{
      key: string;
      value: string;
      indices: number[][];
    }>;
  };
  model_packs?: ModelPack[];
  the_model_info?: {
    cover_image_url?: string;
    [key: string]: unknown;
  };
  /**
   * Runtime packages this node depends on (e.g. "ffmpeg", "python", "ollama").
   * Populated by the backend from node metadata; used to show install prompts.
   */
  required_runtimes?: string[];
  /**
   * Marks a node as generative — its outputs should be auto-saved as assets
   * by the backend, and the UI uses this flag to auto-show the result preview
   * once the node completes. Set by generative providers (fal, kie, replicate,
   * elevenlabs, gemini, openai image/audio nodes, etc.).
   */
  auto_save_asset?: boolean;
}

/** TypeMetadata — re-declared locally because @nodetool/protocol exports a
 *  class with the same name.  This is the JSON-serializable interface shape. */
export interface TypeMetadata {
  type: string;
  optional: boolean;
  values?: Array<string | number> | null;
  type_args: TypeMetadata[];
  type_name?: string | null;
}

/** Everything on a workflow except its graph */
export type WorkflowAttributes = Omit<Workflow, "graph">;

/** Discriminated union of all possible message content blocks */
export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageVideoContent
  | MessageAudioContent
  | MessageDocumentContent;

// ---------------------------------------------------------------------------
// Frontend-only types
// ---------------------------------------------------------------------------

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

export interface ResourceChangeUpdate {
  type: "resource_change";
  event: "created" | "updated" | "deleted";
  resource_type: string;
  resource: {
    id: string;
    etag?: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Model property value types (frontend property onChange shapes)
// ---------------------------------------------------------------------------

export interface LlamaModelValue {
  type: "llama_model";
  repo_id: string;
}

export interface LanguageModelValue {
  type: "language_model";
  id: string;
  provider: Provider;
  name: string;
}

export interface ImageModelValue {
  type: "image_model";
  id: string;
  provider: Provider;
  name: string;
  path: string;
}

export interface TTSModelValue {
  type: "tts_model";
  id: string;
  provider: Provider;
  name: string;
  voices: string[];
  selected_voice: string;
}

export interface HuggingFaceModelValue {
  type: "hf.text_to_image" | "hf.image_to_image";
  repo_id: string;
  path?: string;
}

export type HuggingFaceModelValueInput = HuggingFaceModelValue & {
  id?: string;
  provider?: string;
  name?: string;
};

export interface Model3DModelValue {
  type: "model_3d_model";
  id: string;
  provider?: string;
  name: string;
}

export type InferenceProviderModelValue =
  | { type: "inference_provider_automatic_speech_recognition_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_audio_classification_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_image_classification_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_image_segmentation_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_image_to_image_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_summarization_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_text_classification_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_text_generation_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_text_to_audio_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_text_to_image_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_text_to_speech_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_text_to_text_model"; provider: InferenceProvider; model_id: string }
  | { type: "inference_provider_translation_model"; provider: InferenceProvider; model_id: string };
