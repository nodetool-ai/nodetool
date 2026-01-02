/**
 * API Types for the Chrome extension.
 * Simplified versions of the web app types, focused on chat functionality.
 */

// Message content types
export interface MessageTextContent {
  type: "text";
  text: string;
}

export interface MessageImageContent {
  type: "image_url";
  image_url: {
    url: string;
  };
}

export interface MessageAudioContent {
  type: "audio";
  audio_url: {
    url: string;
  };
}

export interface MessageVideoContent {
  type: "video";
  video_url: {
    url: string;
  };
}

export interface MessageDocumentContent {
  type: "document";
  document_url: {
    url: string;
  };
}

export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageAudioContent
  | MessageVideoContent
  | MessageDocumentContent
  | string;

// Tool call types
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallUpdate {
  id: string;
  tool_call_id: string;
  name?: string;
  arguments?: string;
  output?: string;
  status?: "pending" | "running" | "completed" | "error";
}

// Message type
export interface Message {
  id?: string;
  thread_id?: string;
  role: "user" | "assistant" | "system" | "tool" | "agent_execution";
  content: MessageContent | MessageContent[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  created_at?: string;
  model?: string;
  provider?: string;
  agent_mode?: boolean;
  workflow_id?: string;
  agent_execution_id?: string;
}

// Thread type
export interface Thread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
}

export interface ThreadList {
  threads: Thread[];
  next?: string;
}

export interface ThreadCreateRequest {
  title?: string;
}

export interface ThreadUpdateRequest {
  title?: string;
}

export interface ThreadSummarizeRequest {
  provider: string;
  model: string;
  content: string;
}

// Message list response
export interface MessageList {
  messages: Message[];
  next?: string;
}

// Language model type
export interface LanguageModel {
  type: "language_model";
  provider: string;
  id: string;
  name: string;
  context_length?: number;
}

// Task and Planning updates
export interface TaskUpdate {
  thread_id: string;
  task_id?: string;
  status: "pending" | "running" | "completed" | "error";
  message?: string;
  progress?: number;
  total?: number;
}

export interface PlanningUpdate {
  thread_id: string;
  plan_id?: string;
  status: "planning" | "executing" | "completed" | "error";
  plan?: string;
  current_step?: number;
  total_steps?: number;
}

export interface LogUpdate {
  thread_id: string;
  level: "debug" | "info" | "warning" | "error";
  message: string;
  timestamp?: string;
}

// Workflow types
export interface WorkflowRef {
  type: "workflow";
  id: string;
}

// Node and Job updates (for streaming status)
export interface NodeUpdate {
  node_id: string;
  status: "pending" | "running" | "completed" | "error";
  error?: string;
}

export interface JobUpdate {
  job_id: string;
  status: "pending" | "running" | "completed" | "error";
  node_id?: string;
  error?: string;
}

export interface NodeProgress {
  node_id: string;
  progress: number;
  total: number;
}

// Output types
export interface OutputUpdate {
  node_id: string;
  output: unknown;
}

export interface PreviewUpdate {
  node_id: string;
  preview: string | ArrayBuffer;
}
