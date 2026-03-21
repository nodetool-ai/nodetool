import { components } from "../api";

export type Node = components["schemas"]["Node-Input"];
export type Edge = components["schemas"]["Edge"];
export type Graph = components["schemas"]["Graph-Input"];
export type Asset = Omit<components["schemas"]["Asset"], "size"> & {
  size?: number | null; // File size in bytes - added for size sorting
};
export type AssetList = components["schemas"]["AssetList"];

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
export type AssetRef = components["schemas"]["AssetRef"];
export type AssetUpdateRequest = components["schemas"]["AssetUpdateRequest"];
export type ImageRef = components["schemas"]["ImageRef"];
export type DataframeRef = components["schemas"]["DataframeRef"];
export type ColumnDef = components["schemas"]["ColumnDef"];
export type AudioRef = components["schemas"]["AudioRef"];
export type VideoRef = components["schemas"]["VideoRef"];
export type Model3DRef = components["schemas"]["Model3DRef"];
export type NPArray = components["schemas"]["NPArray"];
export type TextRef = components["schemas"]["TextRef"];
export type WorkflowRef = components["schemas"]["WorkflowRef"];
export type NodeRef = components["schemas"]["NodeRef"];
export type Workflow = components["schemas"]["Workflow"];
export type WorkflowList = components["schemas"]["WorkflowList"];
export type WorkflowTool = components["schemas"]["WorkflowTool"];
export type WorkflowToolList = components["schemas"]["WorkflowToolList"];
export type WorkflowRequest = components["schemas"]["WorkflowRequest"];

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
  graph: Graph;
}

export interface WorkflowVersionList {
  versions: WorkflowVersion[];
  next: string | null;
}

export interface CreateWorkflowVersionRequest {
  name?: string;
  description?: string;
}

export type Property = components["schemas"]["Property"];
export type OutputSlot = components["schemas"]["OutputSlot"];
export type BaseNodeMetadata = components["schemas"]["NodeMetadata"];
export type IndexResponse = components["schemas"]["IndexResponse"];

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
}
export type TypeMetadata = components["schemas"]["TypeMetadata-Input"];
export type Message = components["schemas"]["Message"];
export type Prediction = components["schemas"]["Prediction"];
export type MessageCreateRequest =
  components["schemas"]["MessageCreateRequest"];
export type MessageList = components["schemas"]["MessageList"];
export type MessageTextContent = components["schemas"]["MessageTextContent"];
export type MessageImageContent = components["schemas"]["MessageImageContent"];
export type MessageVideoContent = components["schemas"]["MessageVideoContent"];
export type MessageAudioContent = components["schemas"]["MessageAudioContent"];
export type MessageDocumentContent =
  components["schemas"]["MessageDocumentContent"];
export type Image = components["schemas"]["ImageRef"];
export type Document = components["schemas"]["DocumentRef"];
export type FolderRef = components["schemas"]["FolderRef"];
export type FontRef = components["schemas"]["FontRef"];
export type Audio = components["schemas"]["AudioRef"];
export type Video = components["schemas"]["VideoRef"];
export type RunJobRequest = components["schemas"]["RunJobRequest"];
export type ResourceLimits = components["schemas"]["ResourceLimits"];
export type NodeUpdate = components["schemas"]["NodeUpdate"];
export type OutputUpdate = components["schemas"]["OutputUpdate"];
export type NodeProgress = components["schemas"]["NodeProgress"];
export type PreviewUpdate = components["schemas"]["PreviewUpdate"];
export type TaskUpdate = components["schemas"]["TaskUpdate"];
export type JobUpdate = components["schemas"]["JobUpdate"];
export type LlamaModel = components["schemas"]["LlamaModel"];
export type LanguageModel = components["schemas"]["LanguageModel"];
export type EmbeddingModel = components["schemas"]["EmbeddingModel"];
export type ImageModel = components["schemas"]["ImageModel"];
export type TTSModel = components["schemas"]["TTSModel"];
export type ASRModel = components["schemas"]["ASRModel"];
export type VideoModel = components["schemas"]["VideoModel"];
export type HuggingFaceModel = components["schemas"]["HuggingFaceModel"];
export type UnifiedModel = components["schemas"]["UnifiedModel"] & {
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

export type SystemStats = components["schemas"]["SystemStats"];
export type ToolCall = components["schemas"]["ToolCall"];
export type ToolCallUpdate = components["schemas"]["ToolCallUpdate"];
export type ToolResultUpdate = components["schemas"]["ToolResultUpdate"];
export type Chunk = components["schemas"]["Chunk"];
export type SVGElement = components["schemas"]["SVGElement"];
export type DocumentRef = components["schemas"]["DocumentRef"];
// a type that allows arbitrary members
export type TypeName = string;
export type WorkflowAttributes = Omit<Workflow, "graph">;
export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageVideoContent
  | MessageAudioContent
  | MessageDocumentContent;
export type RepoPath = components["schemas"]["RepoPath"];
export type FileInfo = components["schemas"]["nodetool__api__file__FileInfo"];
export type WorkspaceFileInfo = components["schemas"]["nodetool__api__workspace__FileInfo"];
export type CollectionResponse = components["schemas"]["nodetool__api__collection__CollectionResponse"];
export type CollectionList = components["schemas"]["nodetool__api__collection__CollectionList"];
export type CollectionCreate = components["schemas"]["nodetool__api__collection__CollectionCreate"];
export type Task = components["schemas"]["Task"];
export type TaskPlan = components["schemas"]["TaskPlan"];
export type Step = components["schemas"]["Step"];
export type StepResult = components["schemas"]["StepResult"];
export type PlotlyConfig = components["schemas"]["PlotlyConfig"];
export type PlanningUpdate = components["schemas"]["PlanningUpdate"];
export type InferenceProvider = components["schemas"]["InferenceProvider"];
export type Provider = components["schemas"]["Provider"];
export type ProviderInfo = components["schemas"]["ProviderInfo"];
export type Thread = components["schemas"]["Thread"];
export type ThreadCreateRequest = components["schemas"]["ThreadCreateRequest"];
export type ThreadUpdateRequest = components["schemas"]["ThreadUpdateRequest"];
export type ThreadSummarizeRequest =
  components["schemas"]["ThreadSummarizeRequest"];
export type ThreadList = components["schemas"]["ThreadList"];
export type EdgeUpdate = components["schemas"]["EdgeUpdate"];
export type Notification = components["schemas"]["Notification"];
export type LogUpdate = components["schemas"]["LogUpdate"];
export type ErrorMessage = components["schemas"]["Error"];
export type SecretResponse = components["schemas"]["SecretResponse"];
export type JobResponse = components["schemas"]["JobResponse"];
export type JobListResponse = components["schemas"]["JobListResponse"];
export type CalendarEvent = components["schemas"]["CalendarEvent"];
export type Datetime = components["schemas"]["Datetime"];

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

// Job types
export type Job = JobResponse;

// Model Pack - curated bundle of models that work together
export type ModelPack = components["schemas"]["ModelPack"];

// Workspace types - for managing workspace folders
export type WorkspaceResponse = components["schemas"]["WorkspaceResponse"];
export type WorkspaceListResponse = components["schemas"]["WorkspaceListResponse"];
export type WorkspaceCreateRequest = components["schemas"]["WorkspaceCreateRequest"];
export type WorkspaceUpdateRequest = components["schemas"]["WorkspaceUpdateRequest"];
