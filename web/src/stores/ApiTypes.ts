import { components } from "../api";

export type User = components["schemas"]["User"];
export type Node = components["schemas"]["Node"];
export type Edge = components["schemas"]["Edge"];
export type Asset = components["schemas"]["Asset"];
export type AssetList = components["schemas"]["AssetList"];
export type AssetRef = components["schemas"]["AssetRef"];
export type AssetUpdateRequest = components["schemas"]["AssetUpdateRequest"];
export type ImageRef = components["schemas"]["ImageRef"];
export type DataframeRef = components["schemas"]["DataframeRef"];
export type ColumnDef = components["schemas"]["ColumnDef"];
export type AudioRef = components["schemas"]["AudioRef"];
export type VideoRef = components["schemas"]["VideoRef"];
export type NPArray = components["schemas"]["NPArray"];
export type TextRef = components["schemas"]["TextRef"];
export type WorkflowRef = components["schemas"]["WorkflowRef"];
export type NodeRef = components["schemas"]["NodeRef"];
export type Workflow = components["schemas"]["Workflow"];
export type WorkflowList = components["schemas"]["WorkflowList"];
export type WorkflowRequest = components["schemas"]["WorkflowRequest"];
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
}
export type TypeMetadata = components["schemas"]["TypeMetadata"];
export type Message = components["schemas"]["Message-Output"];
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
export type OAuthAuthorizeRequest =
  components["schemas"]["OAuthAuthorizeRequest"];
export type Image = components["schemas"]["ImageRef"];
export type Document = components["schemas"]["DocumentRef"];
export type FolderRef = components["schemas"]["FolderRef"];
export type Audio = components["schemas"]["AudioRef"];
export type Video = components["schemas"]["VideoRef"];
export type RunJobRequest = components["schemas"]["RunJobRequest"];
export type NodeUpdate = components["schemas"]["NodeUpdate"];
export type NodeProgress = components["schemas"]["NodeProgress"];
export type TaskUpdate = components["schemas"]["TaskUpdate"];
export type JobUpdate = components["schemas"]["JobUpdate"];
export type LlamaModel = components["schemas"]["LlamaModel"];
export type OpenAIModel = components["schemas"]["OpenAIModel"];
export type CachedModel = components["schemas"]["CachedModel"];
export type ModelFile = components["schemas"]["ModelFile"];
export type ModelInfo = components["schemas"]["ModelInfo"];
export type SettingsModel = components["schemas"]["SettingsModel"];
export type SecretsModel = components["schemas"]["SecretsModel"];
export type HuggingFaceModel = components["schemas"]["HuggingFaceModel"];
export type SystemStats = components["schemas"]["SystemStats"];
export type ToolCall = components["schemas"]["ToolCall"];
export type ToolCallUpdate = components["schemas"]["ToolCallUpdate"];
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
export type FileInfo = components["schemas"]["FileInfo"];
export type CollectionResponse = components["schemas"]["CollectionResponse"];
export type CollectionList = components["schemas"]["CollectionList"];
export type CollectionCreate = components["schemas"]["CollectionCreate"];
export interface UnifiedModel {
  id: string;
  type?: string;
  name: string;
  repo_id?: string;
  path?: string | null;
  allow_patterns?: string[];
  ignore_patterns?: string[];
  description?: string;
  readme?: string;
  size_on_disk?: number;
  downloaded?: boolean;
}

export type Task = components["schemas"]["Task"];
export type TaskPlan = components["schemas"]["TaskPlan"];
export type SubTask = components["schemas"]["SubTask"];
export type PlotlyConfig = components["schemas"]["PlotlyConfig"];
