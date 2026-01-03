/**
 * Type definitions for Nodetool Chrome Extension
 */

export interface ServerConfig {
  url: string;
  apiKey?: string;
  authProvider: 'local' | 'static' | 'supabase';
  autoConnect: boolean;
  reconnectAttempts: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContent[];
  timestamp: number;
  model?: string;
  thread_id?: string;
  tool_calls?: ToolCall[];
}

export interface MessageContent {
  type: 'text' | 'image_url' | 'audio' | 'video';
  text?: string;
  image?: { type: 'image'; uri: string };
  audio?: { type: 'audio'; uri: string };
  video?: { type: 'video'; uri: string };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Thread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type ConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'streaming'
  | 'error';

export interface ChatState {
  messages: ChatMessage[];
  isConnected: boolean;
  isStreaming: boolean;
  currentModel: string;
  threadId?: string;
}

export interface PageContext {
  url: string;
  title: string;
  selectedText: string;
  bodyText: string;
  timestamp: number;
}

export interface StoredData {
  serverConfig: ServerConfig;
  chatHistory: Record<string, ChatMessage[]>;
  settings: {
    defaultModel: string;
    autoIncludeContext: boolean;
    theme: 'light' | 'dark' | 'system';
    historyRetentionDays: number;
  };
  favoriteWorkflows: string[];
}

export interface OutgoingMessage {
  role: 'user';
  content: string | MessageContent[];
  model?: string;
  provider?: string;
  thread_id?: string;
  context?: {
    pageUrl?: string;
    pageTitle?: string;
    selectedText?: string;
    pageContent?: string;
  };
}

export interface IncomingMessage {
  type: 'chunk' | 'complete' | 'error' | 'message' | 'tool_call';
  content?: string;
  error?: string;
  tool?: {
    name: string;
    arguments: unknown;
  };
  finish_reason?: 'stop' | 'length' | 'tool_calls';
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Chrome message types for extension communication
export interface ExtensionMessage {
  type: 'GET_PAGE_CONTEXT' | 'PAGE_CONTEXT_RESPONSE' | 'CONNECTION_STATUS' | 'OPEN_SIDEPANEL';
  payload?: unknown;
}

export interface PageContextResponse {
  context: PageContext;
}
