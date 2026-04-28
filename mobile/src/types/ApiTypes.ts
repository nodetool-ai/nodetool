/**
 * API Types — Re-exports from @nodetool-ai/protocol shared types.
 *
 * These types are used throughout the mobile app and are now sourced from
 * the shared protocol package instead of auto-generated OpenAPI types.
 *
 * The openapi-fetch client (src/api.ts) still provides the generated
 * path-typed HTTP interface. This file bridges the two type systems.
 */

import type {
  // Graph & Node types
  Node,
  Edge,
  // Media refs
  ImageRef,
  AudioRef,
  VideoRef,
  TextRef,
  DataframeRef,
  ColumnDef,
  DocumentRef,
  FolderRef,
  FontRef,
  AssetRef,
  WorkflowRef,
  NodeRef,
  NPArray,
  SVGElement,
  PlotlyConfig,
  Datetime,
  CalendarEvent,
  // Asset types
  Asset,
  AssetList,
  AssetUpdateRequest,
  // Workflow types
  Workflow,
  WorkflowList,
  WorkflowRequest,
  WorkflowTool,
  WorkflowToolList,
  WorkflowGraph,
  // Thread & Message types
  Thread,
  ThreadList,
  ThreadCreateRequest,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  Message,
  MessageCreateRequest,
  MessageList,
  MessageTextContent,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent,
  MessageDocumentContent,
  MessageContent,
  ToolCall,
  // Node Metadata types
  PropertyTypeMetadata,
  Property,
  OutputSlot,
  NodeMetadata as _NodeMetadata,
  IndexResponse,
  // Job types
  JobResponse,
  JobListResponse,
  RunJobRequest,
  ResourceLimits,
  // Model types
  Provider,
  InferenceProvider,
  ProviderInfo,
  LanguageModel,
  EmbeddingModel,
  ImageModel,
  TTSModel,
  ASRModel,
  VideoModel,
  LlamaModel,
  HuggingFaceModel,
  UnifiedModel,
  ModelPack,
  // System types
  SystemStats,
  SecretResponse,
  // Task/Agent types
  Task,
  TaskPlan,
  Step,
  StepResult,
  // File/Workspace types
  FileInfo,
  RepoPath,
  CollectionResponse,
  CollectionList,
  CollectionCreate,
  WorkspaceResponse,
  WorkspaceListResponse,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
  // WebSocket message types
  NodeUpdate,
  OutputUpdate,
  NodeProgress,
  PreviewUpdate,
  TaskUpdate,
  JobUpdate,
  EdgeUpdate,
  Notification,
  LogUpdate,
  ToolCallUpdate,
  ToolResultUpdate,
  Chunk,
  PlanningUpdate,
  Prediction,
} from "@nodetool-ai/protocol";

// ── Re-exports ─────────────────────────────────────────────────────────
// Graph & Node
export type { Node, Edge };

// Media refs
export type {
  ImageRef,
  AudioRef,
  VideoRef,
  TextRef,
  DataframeRef,
  ColumnDef,
  DocumentRef,
  FolderRef,
  FontRef,
  AssetRef,
  WorkflowRef,
  NodeRef,
  NPArray,
  SVGElement,
  PlotlyConfig,
  Datetime,
  CalendarEvent,
};

// Asset
export type { Asset, AssetList, AssetUpdateRequest };

// Workflow
export type {
  Workflow,
  WorkflowList,
  WorkflowRequest,
  WorkflowTool,
  WorkflowToolList,
  WorkflowGraph,
};

// Thread & Message
export type {
  Thread,
  ThreadList,
  ThreadCreateRequest,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  Message,
  MessageCreateRequest,
  MessageList,
  MessageTextContent,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent,
  MessageDocumentContent,
  MessageContent,
  ToolCall,
};

// Node Metadata — use protocol names; keep legacy aliases for backward compat
export type TypeMetadata = PropertyTypeMetadata;
export type { Property, OutputSlot, IndexResponse };
export type { PropertyTypeMetadata };

// Job
export type { JobResponse, JobListResponse, RunJobRequest, ResourceLimits };

// Models
export type {
  Provider,
  InferenceProvider,
  ProviderInfo,
  LanguageModel,
  EmbeddingModel,
  ImageModel,
  TTSModel,
  ASRModel,
  VideoModel,
  LlamaModel,
  HuggingFaceModel,
  UnifiedModel,
  ModelPack,
};

// System
export type { SystemStats, SecretResponse };

// Task/Agent
export type { Task, TaskPlan, Step, StepResult };

// Files & Workspace
export type {
  FileInfo,
  RepoPath,
  CollectionResponse,
  CollectionList,
  CollectionCreate,
  WorkspaceResponse,
  WorkspaceListResponse,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
};

// WebSocket message types
export type {
  NodeUpdate,
  OutputUpdate,
  NodeProgress,
  PreviewUpdate,
  TaskUpdate,
  JobUpdate,
  EdgeUpdate,
  Notification,
  LogUpdate,
  ToolCallUpdate,
  ToolResultUpdate,
  Chunk,
  PlanningUpdate,
  Prediction,
};

// ── Mobile-only types (not in protocol) ───────────────────────────────

export interface NodeMetadata extends _NodeMetadata {
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

// Convenience aliases
export type Image = ImageRef;
export type Document = DocumentRef;
export type Audio = AudioRef;
export type Video = VideoRef;
export type Job = JobResponse;

