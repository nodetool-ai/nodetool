export interface JSONSchema {
  type: string;
  title?: string;
  label?: string;
  description?: string;
  format?: string;
  default?: any;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  definitions?: Record<string, JSONSchema>;
  $ref?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  tags: string;
  thumbnail: string;
  thumbnail_url: string;
  input_schema: JSONSchema;
  output_schema: JSONSchema;
  settings: {
    run_mode: "normal" | "app" | "chat" | "headless";
    shortcut?: string;
  };
}

export interface JobUpdate {
  type: "job_update";
  job_id: string;
  status: "completed" | "failed" | "queued" | "running";
  error?: string;
  message?: string;
}

export interface NodeUpdate {
  type: "node_update";
  node_id: string;
  node_name: string;
  status: string;
  error?: string;
  result?: {
    output?: any;
  };
}

export interface NodeProgress {
  type: "node_progress";
  node_id: string;
  progress: number;
  total: number;
  chunk?: string;
}

export interface Chunk {
  type: "chunk";
  node_id: string;
  content: string;
}

export interface TaskUpdate {
  type: "task_update";
  node_id: string;
  task: {
    id: string;
    name: string;
    status: string;
  };
}

export interface OutputUpdate {
  type: "output_update";
  node_id: string;
  node_name: string;
  output_name: string;
  value: unknown;
  output_type: string;
  metadata: Record<string, never>;
}

export interface PlanningUpdate {
  type: "planning_update";
  node_id: string;
  message: string;
}

export interface Prediction {
  type: "prediction";
  node_id: string;
  status: string;
  logs?: string;
}

export interface WorkflowAttributes {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface RunJobRequest {
  type: "run_job_request";
  workflow_id: string;
  job_type: "workflow";
  auth_token: string;
  params: Record<string, any>;
  api_url?: string;
  user_id?: string;
  explicit_types?: boolean;
  graph?: {
    nodes: any[];
    edges: any[];
  };
}

export interface MessageTextContent {
  type: "text";
  text: string;
}

export interface MessageImageContent {
  type: "image_url";
  image: {
    type: "image";
    uri?: string;
    asset_id?: string | null;
    data?: unknown;
  };
}

export interface MessageAudioContent {
  type: "audio";
  audio: {
    type: "audio";
    uri?: string;
    asset_id?: string | null;
    data?: unknown;
  };
}

export interface MessageVideoContent {
  type: "video";
  video: {
    type: "video";
    uri?: string;
    asset_id?: string | null;
    data?: unknown;
  };
}

export interface MessageDocumentContent {
  type: "document";
  document: {
    type: "document";
    uri?: string;
    asset_id?: string | null;
    data?: Uint8Array;
  };
}

export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageAudioContent
  | MessageVideoContent
  | MessageDocumentContent;

export interface Message {
  type: string;
  id?: string | null;
  auth_token?: string | null;
  workflow_id?: string | null;
  thread_id?: string | null;
  user_id?: string | null;
  tool_call_id?: string | null;
  role: string;
  name: string;
  content?: string | MessageContent[] | null;
  tool_calls?: ToolCall[] | null;
  tools?: string[] | null;
  created_at?: string | null;
}

export interface ToolCall {
  type: string;
  id: string;
  name: string;
  args: Record<string, any>;
  result: Record<string, any>;
}

export interface ImageRef {
  type: "image";
  uri: string;
  asset_id?: string | null;
  data?: unknown;
}

export interface AudioRef {
  type: "audio";
  uri: string;
  asset_id?: string | null;
  data?: unknown;
}

export interface VideoRef {
  type: "video";
  uri: string;
  asset_id?: string | null;
  data?: unknown;
}

export interface DocumentRef {
  type: "document";
  uri: string;
  asset_id?: string | null;
  data?: unknown;
}

export type Result =
  | ImageRef
  | AudioRef
  | VideoRef
  | DocumentRef
  | string
  | number;

export type MsgpackData =
  | JobUpdate
  | Prediction
  | NodeProgress
  | NodeUpdate
  | Message
  | ToolCallUpdate
  | TaskUpdate
  | Chunk
  | PlanningUpdate
  | OutputUpdate;

export interface ToolCallUpdate {
  type: "tool_call_update";
  message: string;
}
