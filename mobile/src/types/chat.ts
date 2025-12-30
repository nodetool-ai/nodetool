/**
 * Chat-specific types for the mobile app.
 * Adapted from web/src/stores/ApiTypes.ts and GlobalChatStore.ts
 */

import { Message, MessageContent, LanguageModel, Thread, Chunk, JobUpdate, NodeUpdate, NodeProgress, OutputUpdate } from './ApiTypes';

// Re-export types we use directly
export type { Message, LanguageModel, Thread, Chunk };

// Use the MessageContent from ApiTypes directly
export type { MessageContent };

/**
 * Connection state for WebSocket
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'
  | 'failed';

/**
 * Chat-specific status including runtime states
 */
export type ChatStatus =
  | ConnectionState
  | 'loading'
  | 'streaming'
  | 'error'
  | 'stopping';

/**
 * WebSocket message types that can be received
 */
export type WebSocketMessageData =
  | Message
  | Chunk
  | JobUpdate
  | NodeUpdate
  | NodeProgress
  | OutputUpdate
  | GenerationStoppedUpdate
  | ErrorUpdate;

/**
 * Generation stopped message from server
 */
export interface GenerationStoppedUpdate {
  type: 'generation_stopped';
  message: string;
}

/**
 * Error message from server
 */
export interface ErrorUpdate {
  type: 'error';
  message?: string;
}

/**
 * Message to send to the chat server
 */
export interface ChatMessageRequest {
  type: 'message';
  role: 'user';
  name?: string;
  content: MessageContent[];
  thread_id: string;
  provider?: string;
  model?: string;
  tools?: string[];
  collections?: string[];
  agent_mode?: boolean;
  help_mode?: boolean;
}

/**
 * Stop generation request
 */
export interface StopGenerationRequest {
  type: 'stop';
  thread_id: string;
}

/**
 * State for the chat store
 */
export interface ChatState {
  // Connection state
  status: ChatStatus;
  statusMessage: string | null;
  error: string | null;

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;

  // Messages for current thread
  messageCache: Record<string, Message[]>;
  isLoadingMessages: boolean;

  // Model selection (for future)
  selectedModel: LanguageModel | null;
}

/**
 * Actions for the chat store
 */
export interface ChatActions {
  // Connection actions
  connect: () => Promise<void>;
  disconnect: () => void;

  // Message actions
  sendMessage: (content: MessageContent[], text: string) => Promise<void>;
  stopGeneration: () => void;

  // Thread actions
  createNewThread: (title?: string) => Promise<string>;
  switchThread: (threadId: string) => void;

  // Getters
  getCurrentMessages: () => Message[];

  // Internal
  addMessageToCache: (threadId: string, message: Message) => void;
  setStatus: (status: ChatStatus) => void;
  setError: (error: string | null) => void;
}

/**
 * WebSocket configuration
 */
export interface WebSocketConfig {
  url: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectDecay?: number;
  reconnectAttempts?: number;
  timeoutInterval?: number;
}
