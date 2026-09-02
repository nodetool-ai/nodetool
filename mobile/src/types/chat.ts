/**
 * Chat-specific types for the mobile app.
 * Adapted from web/src/stores/ApiTypes.ts and GlobalChatStore.ts
 */

import { Message, MessageContent, LanguageModel, Thread, Chunk, JobUpdate, NodeUpdate, NodeProgress, OutputUpdate } from './ApiTypes';
import type { MediaGenerationRequest } from '../stores/MediaGenerationStore';
import type { UiContextPayload } from '../documents/uiContext';

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
 * Planning-phase status from the planner behind `create_plan`.
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
  /** Open/focused document ids the agent's `ui_*` tools may address. */
  ui_context?: UiContextPayload;
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
   * Inbound silence (ms) after which the connection is probed with a ping.
   * Must stay above the server's 25s heartbeat. 0 disables the watchdog.
   */
  heartbeatInterval?: number;
  /** Grace period (ms) for traffic to arrive after a probe. */
  heartbeatTimeout?: number;
  /**
   * Extra headers for the connection handshake (React Native native only).
   * Used to send `Authorization: Bearer <token>` so the auth token stays out
   * of the URL.
   */
  headers?: Record<string, string>;
}
