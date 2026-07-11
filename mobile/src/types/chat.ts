/**
 * Chat-specific types for the mobile app.
 * Adapted from web/src/stores/ApiTypes.ts and GlobalChatStore.ts
 */

import { Message, MessageContent, LanguageModel, Thread, Chunk, JobUpdate, NodeUpdate, NodeProgress, OutputUpdate } from './ApiTypes';
import type { MediaGenerationRequest } from '../stores/MediaGenerationStore';

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
  | ErrorUpdate
  | PlanningUpdate
  | TaskUpdateMessage;

/**
 * Planning-phase status from agents (TaskPlanner, CompilerAgent, etc.).
 * Used to drive the chat status banner during long-running agent runs.
 */
export interface PlanningUpdate {
  type: 'planning_update';
  phase?: string;
  status?: string;
  content?: string | null;
  node_id?: string | null;
  thread_id?: string | null;
}

/**
 * Task lifecycle update from the agent task executor.
 */
interface TaskUpdateMessage {
  type: 'task_update';
  event?: string;
  task?: { id?: string; title?: string };
  step?: { id?: string; instructions?: string };
  thread_id?: string | null;
}

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
  media_generation?: MediaGenerationRequest;
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
  /**
   * Extra headers for the connection handshake (React Native native only).
   * Used to send `Authorization: Bearer <token>` so the auth token stays out
   * of the URL.
   */
  headers?: Record<string, string>;
}
