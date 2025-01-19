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
}

export interface JobUpdate {
  type: "job_update";
  job_id: string;
  progress: number;
  total: number;
}

export interface NodeUpdate {
  type: "node_update";
  node_id: string;
  node_name: string;
  status: string;
  progress: number;
  total: number;
  result?: {
    output?: any;
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
    uri: string;
    asset_id?: string | null;
    data?: unknown;
  };
}

export interface MessageAudioContent {
  type: "audio";
  audio: {
    type: "audio";
    uri: string;
    asset_id?: string | null;
    data?: unknown;
  };
}

export interface MessageVideoContent {
  type: "video";
  video: {
    type: "video";
    uri: string;
    asset_id?: string | null;
    data?: unknown;
  };
}

export interface MessageDocumentContent {
  type: "document";
  document: {
    type: "document";
    uri: string;
    asset_id?: string | null;
    data?: unknown;
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
  tool_calls?: any[] | null;
  created_at?: string | null;
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
