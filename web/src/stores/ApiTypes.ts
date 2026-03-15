/**
 * API Types — Re-exports from @nodetool/protocol shared types.
 *
 * These types are used throughout the frontend and are now sourced from
 * the shared protocol package instead of auto-generated OpenAPI types.
 *
 * The openapi-fetch client (ApiClient.ts) still uses the generated api.ts
 * for path-typed HTTP calls. This file bridges the two type systems.
 */

import type {
  // Graph & Node types
  Node as _Node,
  Graph as _Graph,
  Edge as _Edge,
  // Media refs
  ImageRef as _ImageRef,
  AudioRef as _AudioRef,
  VideoRef as _VideoRef,
  TextRef as _TextRef,
  DataframeRef as _DataframeRef,
  ColumnDef as _ColumnDef,
  Model3DRef as _Model3DRef,
  DocumentRef as _DocumentRef,
  FolderRef as _FolderRef,
  FontRef as _FontRef,
  AssetRef as _AssetRef,
  WorkflowRef as _WorkflowRef,
  NodeRef as _NodeRef,
  NPArray as _NPArray,
  SVGElement as _SVGElement,
  PlotlyConfig as _PlotlyConfig,
  Datetime as _Datetime,
  CalendarEvent as _CalendarEvent,
  // Asset types
  Asset as _Asset,
  AssetList as _AssetList,
  AssetUpdateRequest as _AssetUpdateRequest,
  // Workflow types
  Workflow as _Workflow,
  WorkflowList as _WorkflowList,
  WorkflowRequest as _WorkflowRequest,
  WorkflowTool as _WorkflowTool,
  WorkflowToolList as _WorkflowToolList,
  WorkflowGraph as _WorkflowGraph,
  // Workflow version types
  WorkflowVersion as _WorkflowVersion,
  WorkflowVersionList as _WorkflowVersionList,
  WorkflowVersionSaveType as _WorkflowVersionSaveType,
  CreateWorkflowVersionRequest as _CreateWorkflowVersionRequest,
  AutosaveWorkflowRequest as _AutosaveWorkflowRequest,
  AutosaveResponse as _AutosaveResponse,
  // Thread & Message types
  Thread as _Thread,
  ThreadList as _ThreadList,
  ThreadCreateRequest as _ThreadCreateRequest,
  ThreadUpdateRequest as _ThreadUpdateRequest,
  ThreadSummarizeRequest as _ThreadSummarizeRequest,
  Message as _Message,
  MessageCreateRequest as _MessageCreateRequest,
  MessageList as _MessageList,
  MessageTextContent as _MessageTextContent,
  MessageImageContent as _MessageImageContent,
  MessageVideoContent as _MessageVideoContent,
  MessageAudioContent as _MessageAudioContent,
  MessageDocumentContent as _MessageDocumentContent,
  MessageThoughtContent as _MessageThoughtContent,
  MessageContent as _MessageContent,
  ToolCall as _ToolCall,
  // Node Metadata types
  PropertyTypeMetadata as _TypeMetadata,
  Property as _Property,
  OutputSlot as _OutputSlot,
  NodeMetadata as _BaseNodeMetadata,
  IndexResponse as _IndexResponse,
  // Job types
  JobResponse as _JobResponse,
  JobListResponse as _JobListResponse,
  RunJobRequest as _RunJobRequest,
  ResourceLimits as _ResourceLimits,
  // Model types
  Provider as _Provider,
  InferenceProvider as _InferenceProvider,
  ProviderInfo as _ProviderInfo,
  LanguageModel as _LanguageModel,
  EmbeddingModel as _EmbeddingModel,
  ImageModel as _ImageModel,
  TTSModel as _TTSModel,
  ASRModel as _ASRModel,
  VideoModel as _VideoModel,
  LlamaModel as _LlamaModel,
  HuggingFaceModel as _HuggingFaceModel,
  UnifiedModel as _UnifiedModel,
  ModelPack as _ModelPack,
  // System types
  SystemStats as _SystemStats,
  SecretResponse as _SecretResponse,
  // Settings types
  SettingWithValue as _SettingWithValue,
  SettingsResponse as _SettingsResponse,
  SettingsUpdateRequest as _SettingsUpdateRequest,
  // Task/Agent types
  Task as _Task,
  TaskPlan as _TaskPlan,
  Step as _Step,
  // File/Workspace types
  FileInfo as _FileInfo,
  WorkspaceFileInfo as _WorkspaceFileInfo,
  RepoPath as _RepoPath,
  CollectionResponse as _CollectionResponse,
  CollectionList as _CollectionList,
  CollectionCreate as _CollectionCreate,
  WorkspaceResponse as _WorkspaceResponse,
  WorkspaceListResponse as _WorkspaceListResponse,
  WorkspaceCreateRequest as _WorkspaceCreateRequest,
  WorkspaceUpdateRequest as _WorkspaceUpdateRequest,
  // WebSocket message types
  NodeUpdate as _NodeUpdate,
  OutputUpdate as _OutputUpdate,
  NodeProgress as _NodeProgress,
  PreviewUpdate as _PreviewUpdate,
  TaskUpdate as _TaskUpdate,
  JobUpdate as _JobUpdate,
  EdgeUpdate as _EdgeUpdate,
  Notification as _Notification,
  LogUpdate as _LogUpdate,
  ToolCallUpdate as _ToolCallUpdate,
  ToolResultUpdate as _ToolResultUpdate,
  Chunk as _Chunk,
  PlanningUpdate as _PlanningUpdate,
  Prediction as _Prediction,
  StepResult as _StepResult,
  ErrorMessage as _ErrorMessage,
} from "@nodetool/protocol";

// ── Re-exports ─────────────────────────────────────────────────────────
// Graph & Node
export type Node = _Node;
export type Graph = _Graph;
export type Edge = _Edge;

// Media refs
export type ImageRef = _ImageRef;
export type AudioRef = _AudioRef;
export type VideoRef = _VideoRef;
export type TextRef = _TextRef;
export type DataframeRef = _DataframeRef;
export type ColumnDef = _ColumnDef;
export type Model3DRef = _Model3DRef;
export type DocumentRef = _DocumentRef;
export type FolderRef = _FolderRef;
export type FontRef = _FontRef;
export type AssetRef = _AssetRef;
export type WorkflowRef = _WorkflowRef;
export type NodeRef = _NodeRef;
export type NPArray = _NPArray;
export type SVGElement = _SVGElement;
export type PlotlyConfig = _PlotlyConfig;
export type Datetime = _Datetime;
export type CalendarEvent = _CalendarEvent;

// Asset
export type Asset = _Asset;
export type AssetList = _AssetList;
export type AssetUpdateRequest = _AssetUpdateRequest;

// Workflow
export type Workflow = _Workflow;
export type WorkflowList = _WorkflowList;
export type WorkflowRequest = _WorkflowRequest;
export type WorkflowTool = _WorkflowTool;
export type WorkflowToolList = _WorkflowToolList;
export type WorkflowGraph = _WorkflowGraph;

// Workflow versions
export type WorkflowVersion = _WorkflowVersion;
export type WorkflowVersionList = _WorkflowVersionList;
export type WorkflowVersionSaveType = _WorkflowVersionSaveType;
export type CreateWorkflowVersionRequest = _CreateWorkflowVersionRequest;
export type AutosaveWorkflowRequest = _AutosaveWorkflowRequest;
export type AutosaveResponse = _AutosaveResponse;
// Thread & Message
export type Thread = _Thread;
export type ThreadList = _ThreadList;
export type ThreadCreateRequest = _ThreadCreateRequest;
export type ThreadUpdateRequest = _ThreadUpdateRequest;
export type ThreadSummarizeRequest = _ThreadSummarizeRequest;
export type Message = _Message;
export type MessageCreateRequest = _MessageCreateRequest;
export type MessageList = _MessageList;
export type MessageTextContent = _MessageTextContent;
export type MessageImageContent = _MessageImageContent;
export type MessageVideoContent = _MessageVideoContent;
export type MessageAudioContent = _MessageAudioContent;
export type MessageDocumentContent = _MessageDocumentContent;
export type MessageThoughtContent = _MessageThoughtContent;
export type MessageContent = _MessageContent;
export type ToolCall = _ToolCall;

// Node Metadata
export type TypeMetadata = _TypeMetadata;
export type Property = _Property;
export type OutputSlot = _OutputSlot;
export type BaseNodeMetadata = _BaseNodeMetadata;
export type IndexResponse = _IndexResponse;

// Job
export type JobResponse = _JobResponse;
export type JobListResponse = _JobListResponse;
export type RunJobRequest = _RunJobRequest;
export type ResourceLimits = _ResourceLimits;

// Models
export type Provider = _Provider;
export type InferenceProvider = _InferenceProvider;
export type ProviderInfo = _ProviderInfo;
export type LanguageModel = _LanguageModel;
export type EmbeddingModel = _EmbeddingModel;
export type ImageModel = _ImageModel;
export type TTSModel = _TTSModel;
export type ASRModel = _ASRModel;
export type VideoModel = _VideoModel;
export type LlamaModel = _LlamaModel;
export type HuggingFaceModel = _HuggingFaceModel;
export type UnifiedModel = _UnifiedModel;
export type ModelPack = _ModelPack;

// System
export type SystemStats = _SystemStats;
export type SecretResponse = _SecretResponse;

// Settings
export type SettingWithValue = _SettingWithValue;
export type SettingsResponse = _SettingsResponse;
export type SettingsUpdateRequest = _SettingsUpdateRequest;
// Task/Agent
export type Task = _Task;
export type TaskPlan = _TaskPlan;
export type Step = _Step;

// Files & Workspace
export type FileInfo = _FileInfo;
export type WorkspaceFileInfo = _WorkspaceFileInfo;
export type RepoPath = _RepoPath;
export type CollectionResponse = _CollectionResponse;
export type CollectionList = _CollectionList;
export type CollectionCreate = _CollectionCreate;
export type WorkspaceResponse = _WorkspaceResponse;
export type WorkspaceListResponse = _WorkspaceListResponse;
export type WorkspaceCreateRequest = _WorkspaceCreateRequest;
export type WorkspaceUpdateRequest = _WorkspaceUpdateRequest;

// WebSocket message types
export type NodeUpdate = _NodeUpdate;
export type OutputUpdate = _OutputUpdate;
export type NodeProgress = _NodeProgress;
export type PreviewUpdate = _PreviewUpdate;
export type TaskUpdate = _TaskUpdate;
export type JobUpdate = _JobUpdate;
export type EdgeUpdate = _EdgeUpdate;
export type Notification = _Notification;
export type LogUpdate = _LogUpdate;
export type ToolCallUpdate = _ToolCallUpdate;
export type ToolResultUpdate = _ToolResultUpdate;
export type Chunk = _Chunk;
export type PlanningUpdate = _PlanningUpdate;
export type Prediction = _Prediction;
export type StepResult = _StepResult;
export type ErrorMessage = _ErrorMessage;

// ── Frontend-only types (not in protocol) ──────────────────────────────

// Extended NodeMetadata with search info for the node browser
export interface NodeMetadata extends _BaseNodeMetadata {
  searchInfo?: {
    score?: number;
    matches?: Array<{
      key: string;
      value: string;
      indices: number[][];
    }>;
  };
  model_packs?: _ModelPack[];
}

// Asset search types
export interface AssetWithPath extends _Asset {
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

// Model property value types for component onChange handlers
export interface LlamaModelValue {
  type: "llama_model";
  repo_id: string;
}

export interface LanguageModelValue {
  type: "language_model";
  id: string;
  provider: _Provider;
  name: string;
}

export interface ImageModelValue {
  type: "image_model";
  id: string;
  provider: _Provider;
  name: string;
  path: string;
}

export interface TTSModelValue {
  type: "tts_model";
  id: string;
  provider: _Provider;
  name: string;
  voices: string[];
  selected_voice: string;
}

// Convenience aliases
export type Image = _ImageRef;
export type Document = _DocumentRef;
export type Audio = _AudioRef;
export type Video = _VideoRef;
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
export type TypeName = string;
export type WorkflowAttributes = Omit<_Workflow, "graph">;
export type Job = _JobResponse;

// Resource change update type for WebSocket notifications
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
