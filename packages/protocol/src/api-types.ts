/**
 * @nodetool/protocol – API Entity Types
 *
 * Plain interfaces for HTTP API request/response shapes.
 * These mirror the database models but are transport-only (no class methods).
 * Used by both the backend HTTP handlers and the frontend stores.
 */

import type { Edge } from "./graph.js";

// ---------------------------------------------------------------------------
// Media Refs
// ---------------------------------------------------------------------------

export interface ImageRef {
  type: "image";
  uri?: string;
  asset_id?: string | null;
  temp_id?: string | null;
  data?: unknown;
  metadata?: Record<string, unknown> | null;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface AudioRef {
  type: "audio";
  uri?: string;
  asset_id?: string | null;
  temp_id?: string | null;
  duration?: number | null;
  data?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface VideoRef {
  type: "video";
  uri?: string;
  asset_id?: string | null;
  temp_id?: string | null;
  duration?: number | null;
  data?: unknown;
  metadata?: Record<string, unknown> | null;
  format?: string | null;
}

export interface TextRef {
  type: "text";
  uri?: string;
  asset_id?: string | null;
  temp_id?: string | null;
  data?: string | null;
}

export interface DataframeRef {
  type: "dataframe";
  uri: string;
  asset_id?: string | null;
  temp_id?: string | null;
  columns?: ColumnDef[] | null;
  data?: unknown[][] | null;
}

export interface ColumnDef {
  name: string;
  data_type: string;
  description?: string;
}

export interface Model3DRef {
  type: "model_3d";
  uri: string;
  asset_id?: string | null;
  temp_id?: string | null;
}

export interface DocumentRef {
  type: "document";
  uri: string;
  asset_id?: string | null;
  temp_id?: string | null;
}

export interface FolderRef {
  type: "folder";
  uri: string;
  asset_id?: string | null;
}

export interface FontRef {
  type: "font";
  uri: string;
  asset_id?: string | null;
}

export interface AssetRef {
  type: "asset" | "image" | "audio" | "video" | "document" | "text";
  uri: string;
  asset_id?: string | null;
  temp_id?: string | null;
  data?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface WorkflowRef {
  type: "workflow_ref";
  id: string;
}

export interface NodeRef {
  type: "node_ref";
  id: string;
}

export interface NPArray {
  type: "np_array";
  uri: string;
  asset_id?: string | null;
  value?: unknown[];
  dtype?: string;
  shape?: number[];
}

export interface SVGElement {
  type: "svg" | "svg_element";
  name?: string;
  value?: string;
  attributes?: Record<string, string>;
  content?: string | null;
  children?: SVGElement[];
}

export interface PlotlyConfig {
  type: "plotly_config";
  data: unknown[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface ChartSeries {
  type?: string;
  x_column?: string | null;
  y_column?: string | null;
  label?: string | null;
  [key: string]: unknown;
}

export interface ChartData {
  type: "chart_data";
  series: ChartSeries[];
  row?: string | null;
  col?: string | null;
  col_wrap?: number | null;
}

export interface ChartConfig {
  type: "chart_config";
  title?: string;
  x_label?: string;
  y_label?: string;
  legend?: boolean;
  data?: ChartData;
  height?: number | null;
  aspect?: number | null;
  x_lim?: [number, number] | null;
  y_lim?: [number, number] | null;
  x_scale?: "linear" | "log" | null;
  y_scale?: "linear" | "log" | null;
  legend_position?: "auto" | "right" | "left" | "top" | "bottom";
  palette?: string | null;
  [key: string]: unknown;
}

export interface Datetime {
  type: "datetime";
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  microsecond?: number;
  tzinfo?: string | null;
  utc_offset?: number | null;
}

export interface CalendarEvent {
  type: "calendar_event";
  title: string;
  start?: Datetime | null;
  end?: Datetime | null;
  description?: string;
  location?: string;
  all_day?: boolean;
  /** Alias fields used by the frontend */
  start_date?: Datetime | string | null;
  end_date?: Datetime | string | null;
  calendar?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

export interface Asset {
  id: string;
  user_id: string;
  parent_id: string;
  name: string;
  content_type: string;
  size?: number | null;
  duration?: number | null;
  metadata?: Record<string, unknown> | null;
  workflow_id: string | null;
  node_id?: string | null;
  job_id?: string | null;
  created_at: string;
  /** URL to download/access the asset (computed by API) */
  get_url: string | null;
  /** URL for thumbnail image (computed by API) */
  thumb_url: string | null;
  etag?: string | null;
}

export interface AssetList {
  next: string | null;
  assets: Asset[];
}

export interface AssetUpdateRequest {
  name?: string;
  parent_id?: string | null;
  content_type?: string;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export interface WorkflowGraph {
  nodes: Node[];
  edges: Edge[];
}

export interface Workflow {
  id: string;
  user_id?: string;
  name: string;
  tool_name?: string | null;
  description: string;
  tags?: string[] | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  graph: WorkflowGraph;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  settings?: Record<string, string | number | boolean | null> | null;
  package_name?: string | null;
  path?: string | null;
  run_mode?: string | null;
  workspace_id?: string | null;
  required_providers?: string[] | null;
  required_models?: string[] | null;
  html_app?: string | null;
  receive_clipboard?: boolean | null;
  access: string;
  created_at: string;
  updated_at: string;
  etag?: string | null;
}

export interface WorkflowList {
  next: string | null;
  workflows: Workflow[];
}

export interface WorkflowRequest {
  name: string;
  tool_name?: string | null;
  package_name?: string | null;
  path?: string | null;
  description?: string | null;
  tags?: string[] | null;
  access: string;
  graph?: WorkflowGraph;
  settings?: Record<string, string | number | boolean | null> | null;
  run_mode?: string | null;
  workspace_id?: string | null;
  html_app?: string | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  receive_clipboard?: boolean | null;
}

export interface WorkflowTool {
  id: string;
  name: string;
  tool_name: string;
  description: string;
}

export interface WorkflowToolList {
  tools: WorkflowTool[];
}

// ---------------------------------------------------------------------------
// Thread & Message
// ---------------------------------------------------------------------------

export interface Thread {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  etag?: string | null;
}

export interface ThreadList {
  next?: string | null;
  threads: Thread[];
}

export interface ThreadCreateRequest {
  title?: string;
}

export interface ThreadUpdateRequest {
  title: string;
}

export interface ThreadSummarizeRequest {
  provider: string;
  model: string;
  content: string;
}

export interface MessageImageUrlContent {
  type: "image_url";
  image: ImageRef;
}

export interface MessageTextContent {
  type: "text";
  text: string;
}

export interface MessageImageContent {
  type: "image_url";
  image: ImageRef;
}

export interface MessageVideoContent {
  type: "video";
  video: VideoRef;
}

export interface MessageAudioContent {
  type: "audio";
  audio: AudioRef;
}

export interface MessageDocumentContent {
  type: "document";
  document: DocumentRef;
}

export interface MessageThoughtContent {
  type: "thought";
  text: string;
  thought_signature?: string | null;
}

export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageImageUrlContent
  | MessageVideoContent
  | MessageAudioContent
  | MessageDocumentContent
  | MessageThoughtContent;

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  step_id?: string | null;
  message?: string | null;
}

/**
 * Media-generation request metadata attached to chat messages.
 * When `mode` is "image" or "video", the server interprets the message as a
 * text-to-image / text-to-video request and invokes the provider's media
 * generation API rather than a regular LLM round. The resulting assets are
 * returned as MessageImageContent / MessageVideoContent in the assistant
 * message and stored via the asset service.
 */
export type MediaGenerationMode =
  | "chat"
  | "image"
  | "image_edit"
  | "video"
  | "image_to_video"
  | "audio"
  | "audio_to_video"
  | "retake"
  | "extend"
  | "motion_control";

export interface MediaGenerationRequest {
  mode: MediaGenerationMode;
  /** Provider id (e.g. "fal_ai", "openai", "replicate"). */
  provider?: string | null;
  /** Model id for the selected media model. */
  model?: string | null;
  /** Output width in pixels (image or video). */
  width?: number | null;
  /** Output height in pixels (image or video). */
  height?: number | null;
  /** Aspect ratio label, e.g. "16:9". */
  aspect_ratio?: string | null;
  /** Named resolution tier, e.g. "1K", "1080p". */
  resolution?: string | null;
  /** Number of variations to generate (images). */
  variations?: number | null;
  /** Duration in seconds (video). */
  duration?: number | null;
  /** Voice id for text-to-speech. */
  voice?: string | null;
  /** Speech rate for text-to-speech (0.25 - 4.0). */
  speed?: number | null;
  /** Output audio format (e.g. "mp3", "wav", "pcm"). */
  audio_format?: string | null;
  /** Strength for image-to-image edits (0..1). */
  strength?: number | null;
  /** Sampler steps for image-to-image edits. */
  num_inference_steps?: number | null;
  /** Source image asset id (image_edit / image_to_video). */
  source_asset_id?: string | null;
  /** Extra provider-specific params. */
  extras?: Record<string, unknown> | null;
}

export interface Message {
  type?: "message";
  id?: string | null;
  user_id?: string;
  thread_id?: string | null;
  role: string;
  name?: string | null;
  content?: string | MessageContent[] | Record<string, unknown> | null;
  tool_calls?: ToolCall[] | null;
  tool_call_id?: string | null;
  input_files?: unknown[] | null;
  output_files?: unknown[] | null;
  provider?: string | null;
  model?: string | null;
  cost?: number | null;
  workflow_id?: string | null;
  graph?: Record<string, unknown> | null;
  tools?: string[] | null;
  collections?: string[] | null;
  agent_mode?: boolean | null;
  /**
   * When `agent_mode` is true, selects which planner the server uses:
   * - `"multi"` — TaskPlanner builds a parallel task DAG (one LLM step per
   *   task) and ParallelTaskExecutor runs them.
   * - `"graph"` — GraphPlanner builds a workflow graph of nodes
   *   (TextToImage, AgentStep, etc.) and AgentWorkflowRunner executes it.
   *
   * If omitted, the server picks a default ("graph" when a NodeRegistry is
   * wired, otherwise "multi") for backward compatibility.
   */
  agent_planner?: "multi" | "graph" | null;
  help_mode?: boolean | null;
  agent_execution_id?: string | null;
  execution_event_type?: string | null;
  workflow_target?: string | null;
  created_at?: string | null;
  /**
   * Media-generation metadata. When present with `mode !== "chat"` the server
   * routes the prompt to the provider's media API instead of a regular LLM
   * turn. Echoed back on assistant messages so the UI can render generation
   * headers (model, variation count, resolution) alongside the output assets.
   */
  media_generation?: MediaGenerationRequest | null;
}

export interface MessageCreateRequest {
  role?: string;
  name?: string;
  content?: string | MessageContent[];
  thread_id: string;
}

export interface MessageList {
  next?: string | null;
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Node Metadata
// ---------------------------------------------------------------------------

export interface PropertyTypeMetadata {
  type: string;
  optional: boolean;
  values?: Array<string | number> | null;
  type_args: PropertyTypeMetadata[];
  type_name?: string | null;
}

// Note: The TypeMetadata *class* (with .fromString() etc.) is exported from
// type-metadata.ts. This interface is the JSON-serializable shape used in
// API transport (node metadata, properties, outputs).

export interface Property {
  name: string;
  type: PropertyTypeMetadata;
  default?: unknown;
  title?: string | null;
  description?: string | null;
  min?: number | null;
  max?: number | null;
  values?: Array<string | number> | null;
  json_schema_extra?: Record<string, unknown> | null;
  required: boolean;
}

export interface OutputSlot {
  type: PropertyTypeMetadata;
  name: string;
  stream: boolean;
}

export interface NodeMetadata {
  title: string;
  description: string;
  namespace: string;
  node_type: string;
  layout: string;
  properties: Property[];
  outputs: OutputSlot[];

  recommended_models: UnifiedModel[];
  basic_fields: string[];
  required_settings: string[];
  is_dynamic: boolean;
  is_streaming_output: boolean;
  expose_as_tool: boolean;
  supports_dynamic_outputs: boolean;
  model_packs?: ModelPack[];
}

export interface IndexResponse {
  node_metadata: NodeMetadata[];
}

// ---------------------------------------------------------------------------
// Node (API transport shape)
// ---------------------------------------------------------------------------

export interface Node {
  id: string;
  parent_id?: string | null;
  type: string;
  data?: unknown;
  ui_properties?: unknown;
  dynamic_properties?: Record<string, unknown>;
  dynamic_outputs?: Record<string, PropertyTypeMetadata>;
  sync_mode: string;
  [key: string]: unknown;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export interface JobResponse {
  id: string;
  user_id: string;
  job_type: string;
  workflow_id: string;
  status: string | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  cost?: number | null;
  suspended_node_id?: string | null;
  suspension_reason?: string | null;
  error_message?: string | null;
  execution_strategy?: string | null;
  is_resumable?: boolean;
  etag?: string | null;
}

export interface JobListResponse {
  jobs: JobResponse[];
  next?: string | null;
}

export interface RunJobRequest {
  type?: "run_job_request";
  job_id?: string | null;
  job_type?: string;
  execution_strategy?: string;
  workflow_id: string;
  user_id?: string;
  auth_token?: string;
  api_url?: string | null;
  params?: Record<string, unknown> | null;
  messages?: Message[] | null;
  env?: Record<string, unknown>;
  graph?: WorkflowGraph;
  explicit_types?: Record<string, string> | boolean;
  resource_limits?: ResourceLimits | null;
}

export interface ResourceLimits {
  max_jobs?: number;
  max_duration_seconds?: number;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "huggingface"
  | "replicate"
  | "fal"
  | "elevenlabs"
  | "aime"
  | "local"
  | "empty"
  | string;

export type InferenceProvider =
  | "cerebras"
  | "cohere"
  | "fal-ai"
  | "featherless-ai"
  | "fireworks-ai"
  | "groq"
  | "hf-inference"
  | "hyperbolic"
  | "nebius"
  | "novita"
  | "nscale"
  | "openai"
  | "replicate"
  | "sambanova"
  | "scaleway"
  | "together"
  | "zai-org"
  | string;

export interface ProviderInfo {
  provider: Provider;
  capabilities: string[];
}

export interface LanguageModel {
  type: string;
  id: string;
  name: string;
  provider: Provider;
  path?: string | null;
  supported_tasks?: string[];
  /**
   * Whether this model supports tool / function calling. `null` or omitted
   * means unknown — callers should treat it as supported by default. Set
   * explicitly to `false` for models the provider declares as
   * non-tool-capable (e.g. HuggingFace inference models, Replicate, OpenAI
   * `o1` family on OpenRouter).
   */
  supports_tools?: boolean | null;
}

export interface EmbeddingModel {
  type: string;
  id: string;
  name: string;
  provider: Provider;
  dimensions?: number;
}

export interface ImageModel {
  type: string;
  id: string;
  name: string;
  provider: Provider;
  path?: string | null;
  supported_tasks?: string[];
}

export interface TTSModel {
  type: string;
  id: string;
  name: string;
  provider: Provider;
  path?: string | null;
  voices?: string[];
  selected_voice?: string;
}

export interface ASRModel {
  type: string;
  id: string;
  name: string;
  provider: Provider;
  path?: string | null;
}

export interface VideoModel {
  type: string;
  id: string;
  name: string;
  provider: Provider;
  path?: string | null;
  supported_tasks?: string[];
}

export interface LlamaModel {
  repo_id: string;
  name?: string;
}

export interface HuggingFaceModel {
  repo_id: string;
  type?: string;
  name?: string;
  path?: string;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  downloaded?: boolean | null;
  size_on_disk?: number | null;
  pipeline_tag?: string | null;
  supported_tasks?: string[] | null;
  trending_score?: number | null;
  image?: string | null;
  description?: string | null;
  tags?: string[] | null;
}

export interface UnifiedModel {
  id: string;
  name: string;
  provider?: Provider;
  type?: string | null;
  repo_id?: string | null;
  path?: string | null;
  artifact_family?: string | null;
  artifact_component?: string | null;
  artifact_confidence?: number | null;
  artifact_evidence?: string[] | null;
  cache_path?: string | null;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  description?: string | null;
  readme?: string | null;
  downloaded?: boolean | null;
  size_on_disk?: number | null;
  pipeline_tag?: string | null;
  tags?: string[] | null;
  has_model_index?: boolean | null;
  downloads?: number | null;
  likes?: number | null;
  supported_tasks?: string[] | null;
  trending_score?: number | null;
  image?: string | null;
  /** See {@link LanguageModel.supports_tools}. Only meaningful for LLMs. */
  supports_tools?: boolean | null;
  /** Voice IDs supported by this model. Only meaningful for TTS models. */
  voices?: string[] | null;
}

export interface ModelPack {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  models: UnifiedModel[];
  total_size?: number | null;
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export interface SystemStats {
  cpu_percent: number;
  memory_percent: number;
  memory_used?: number;
  memory_total?: number;
  memory_total_gb?: number;
  memory_used_gb?: number;
  disk_percent?: number;
  gpu_percent?: number;
  gpu_memory_percent?: number;
  vram_total_gb?: number | null;
  vram_used_gb?: number | null;
  vram_percent?: number | null;
}

export interface SecretResponse {
  id?: string | null;
  user_id?: string | null;
  key: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_configured: boolean;
  is_unreadable?: boolean;
  is_set?: boolean;
  group?: string;
}

// ---------------------------------------------------------------------------
// Task / Agent
// ---------------------------------------------------------------------------

export interface Task {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  instructions?: string;
  status?: string;
  steps?: Step[];
  result?: unknown;
  error?: string | null;
  [key: string]: unknown;
}

export interface TaskPlan {
  type?: "task_plan";
  title?: string;
  task?: Task;
  tasks?: Task[];
  steps?: Step[];
}

export interface Step {
  id?: string;
  name?: string;
  instructions?: string;
  status?: string;
  tool?: string | null;
  result?: unknown;
  error?: string | null;
  completed?: boolean;
  start_time?: number;
  [key: string]: unknown;
}

// StepResult is exported from messages.ts (WebSocket message type)

// ---------------------------------------------------------------------------
// Files & Workspace
// ---------------------------------------------------------------------------

export interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: string;
}

export interface WorkspaceFileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: string;
}

export interface RepoPath {
  repo_id: string;
  path: string;
  downloaded: boolean;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface CollectionResponse {
  name: string;
  count: number;
  metadata?: Record<string, unknown>;
  workflow_name?: string | null;
}

export interface CollectionList {
  collections: CollectionResponse[];
  count?: number;
}

export interface CollectionCreate {
  name: string;
  embedding_model: string;
  embedding_provider?: string | null;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface WorkspaceResponse {
  id: string;
  user_id: string;
  name: string;
  path: string;
  is_default?: boolean;
  is_accessible?: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceResponse[];
  next?: string | null;
}

export interface WorkspaceCreateRequest {
  name: string;
  description?: string;
}

export interface WorkspaceUpdateRequest {
  name?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Workflow Version
// ---------------------------------------------------------------------------

export type WorkflowVersionSaveType =
  | "manual"
  | "autosave"
  | "checkpoint"
  | "restore";

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  user_id?: string;
  version: number;
  created_at: string;
  name: string;
  description: string;
  save_type: string;
  autosave_metadata?: Record<string, unknown> | null;
  is_pinned?: boolean;
  graph: WorkflowGraph;
}

export interface WorkflowVersionList {
  next: string | null;
  versions: WorkflowVersion[];
}

export interface CreateWorkflowVersionRequest {
  name?: string;
  description?: string;
}

export interface AutosaveWorkflowRequest {
  save_type?: string;
  description?: string;
  force?: boolean;
  client_id?: string | null;
  graph?: WorkflowGraph | null;
  max_versions?: number | null;
}

export interface AutosaveResponse {
  version?: WorkflowVersion | null;
  message: string;
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface SettingWithValue {
  package_name: string;
  env_var: string;
  group: string;
  description: string;
  enum?: string[] | null;
  value?: unknown;
  is_secret: boolean;
}

export interface SettingsResponse {
  settings: SettingWithValue[];
}

export interface SettingsUpdateRequest {
  settings: Record<string, unknown>;
  secrets?: Record<string, unknown>;
}
