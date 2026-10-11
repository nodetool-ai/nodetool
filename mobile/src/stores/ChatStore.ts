/**
 * Chat state management store using Zustand.
 * Adapted from web/src/stores/GlobalChatStore.ts
 * 
 * Manages:
 * - WebSocket connection state
 * - Message cache per thread
 * - Current thread management
 * - Sending and receiving messages
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketManager } from '../services/WebSocketManager';
import { apiService } from '../services/api';
import { useAuthStore } from './AuthStore';
import {
  ChatStatus,
  ConnectionState,
  Message,
  MessageContent,
  Thread,
  ChatMessageRequest,
  WebSocketMessageData,
  LanguageModel,
} from '../types';
import type { MediaGenerationRequest } from './MediaGenerationStore';
import { buildUiContext } from '../documents/uiContext';
import { MobileToolRegistry } from '../documents/tools/registry';
import {
  executeToolCall,
  isToolCallMessage,
} from '../documents/tools/executeToolCall';
import '../documents/tools';
import { isString } from '../utils/typePredicates';

interface ChatState {
  // Connection state
  status: ChatStatus;
  statusMessage: string | null;
  error: string | null;

  // WebSocket manager
  wsManager: WebSocketManager | null;

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;

  // Message cache
  messageCache: Record<string, Message[]>;
  isLoadingMessages: boolean;

  // Model selection
  selectedModel: LanguageModel | null;

  // Chat options (mirrors web GlobalChatStore)
  agentMode: boolean;
  helpMode: boolean;
  selectedCollections: string[];
  selectedTools: string[];

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  /**
   * Send a user message. Resolves `true` once the message is on the wire and
   * `false` when it could not be sent (the reason is in `error`). Never rejects.
   */
  sendMessage: (content: MessageContent[], text: string, mediaGeneration?: MediaGenerationRequest) => Promise<boolean>;
  stopGeneration: () => void;
  createNewThread: (title?: string) => Promise<string>;
  loadThreadFromServer: (threadId: string) => Promise<void>;
  setSelectedModel: (model: LanguageModel) => void;
  setAgentMode: (enabled: boolean) => void;
  setHelpMode: (enabled: boolean) => void;
  setSelectedCollections: (collections: string[]) => void;
  setSelectedTools: (tools: string[]) => void;

  // Internal actions
  addMessageToCache: (threadId: string, message: Message) => void;
}

// Tracks the in-flight safety timeout from sendMessage. Module-scoped so
// the cancellation path doesn't have to plumb it through state.
let safetyTimeoutId: ReturnType<typeof setTimeout> | null = null;

// What the live socket is connected to (URL plus auth token), so a repeated
// `connect()` for the same target keeps the socket instead of tearing down a
// reply that is streaming.
let activeConnectionKey: string | null = null;

/** Socket states in which an existing manager is still usable. */
const LIVE_SOCKET_STATES: ReadonlySet<ConnectionState> = new Set<ConnectionState>([
  'connected',
  'connecting',
  'reconnecting',
]);

/** Socket states that mean the chat has no working connection. */
const LOST_SOCKET_STATES: ReadonlySet<ConnectionState> = new Set<ConnectionState>([
  'disconnected',
  'reconnecting',
  'failed',
]);

export const STREAM_LOST_ERROR = 'Connection lost while the reply was streaming';

function clearSafetyTimeout(): void {
  if (safetyTimeoutId !== null) {
    clearTimeout(safetyTimeoutId);
    safetyTimeoutId = null;
  }
}

/**
 * Handle incoming WebSocket messages and update state
 */
function handleWebSocketMessage(
  data: WebSocketMessageData,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState
): void {
  const state = get();
  const threadId = state.currentThreadId;

  console.log('WebSocket message received:', data.type);

  if (state.status === 'stopping') {
    // Only process certain messages while stopping; messages without a type are ignored
    const msgType = data.type ?? '';
    if (!['generation_stopped', 'error', 'job_update'].includes(msgType)) {
      return;
    }
  }

  // Client-side tool call. Handled before the switch because `tool_call` is a
  // request/response exchange rather than a state update, and because the
  // result must go back even for a tool we don't have.
  // `data` is typed as the set of state-update messages, which `tool_call` is
  // deliberately not part of — widen before narrowing.
  const incoming: unknown = data;
  if (isToolCallMessage(incoming)) {
    const { wsManager } = state;
    if (wsManager) {
      set({ statusMessage: `Running ${incoming.name}` });
      void executeToolCall(incoming, wsManager);
    }
    return;
  }

  switch (data.type) {
    case 'message': {
      const msg = data;
      const msgThreadId = msg.thread_id ?? threadId;
      if (!msgThreadId) {break;}

      // Don't add duplicate messages
      const existingMessages = state.messageCache[msgThreadId] || [];
      
      // Handle assistant message - may need to replace streaming placeholder
      if (msg.role === 'assistant') {
        const lastMsg = existingMessages[existingMessages.length - 1];
        if (lastMsg?.role === 'assistant' && !lastMsg.id?.startsWith('server-')) {
          // Replace the streaming placeholder with the final message
          set((s) => ({
            messageCache: {
              ...s.messageCache,
              [msgThreadId]: [...existingMessages.slice(0, -1), msg],
            },
            status: 'connected',
          }));
          break;
        }
      }

      // Add new message
      set((s) => ({
        messageCache: {
          ...s.messageCache,
          [msgThreadId]: [...(s.messageCache[msgThreadId] || []), msg],
        },
      }));
      break;
    }

    case 'chunk': {
      const chunk = data;
      // A chunk names its thread when the server knows it. Route by that, so a
      // reply still streaming into a thread the user left does not land in
      // the thread now on screen.
      const chunkThreadId = chunk.thread_id ?? threadId;
      if (!chunkThreadId) {break;}

      // Audio chunks carry binary payloads (Float32Array or base64); only
      // text contributes to the assistant message.
      const chunkText = isString(chunk.content) ? chunk.content : '';

      const messages = state.messageCache[chunkThreadId] || [];
      const lastMessage = messages[messages.length - 1];

      if (lastMessage?.role === 'assistant') {
        // Append to existing assistant message
        const updatedMessage: Message = {
          ...lastMessage,
          content: (lastMessage.content || '') + chunkText,
        };
        set((s) => ({
          status: chunk.done ? 'connected' : 'streaming',
          messageCache: {
            ...s.messageCache,
            [chunkThreadId]: [...messages.slice(0, -1), updatedMessage],
          },
        }));
      } else {
        // Create new assistant message
        const newMessage: Message = {
          id: `local-stream-${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: chunkText,
        };
        set((s) => ({
          status: chunk.done ? 'connected' : 'streaming',
          messageCache: {
            ...s.messageCache,
            [chunkThreadId]: [...messages, newMessage],
          },
        }));
      }

      if (chunk.done) {
        set({ status: 'connected', statusMessage: null });
      }
      break;
    }

    case 'job_update': {
      const jobUpdate = data as { status: string; error?: string };
      if (jobUpdate.status === 'completed') {
        set({ status: 'connected', statusMessage: null });
      } else if (jobUpdate.status === 'failed') {
        set({
          status: 'error',
          error: jobUpdate.error || 'Job failed',
          statusMessage: null,
        });
      }
      break;
    }

    case 'node_update': {
      const nodeUpdate = data as { status: string; node_name?: string };
      if (nodeUpdate.status === 'completed') {
        set({ status: 'connected', statusMessage: null });
      } else {
        set({ statusMessage: nodeUpdate.node_name || null });
      }
      break;
    }

    case 'planning_update': {
      const pu = data as { phase?: string; status?: string; content?: string };
      if (pu.status === 'completed' || pu.status === 'failed') {
        set({ statusMessage: null });
      } else {
        set({ statusMessage: pu.content || null });
      }
      break;
    }

    case 'task_update': {
      // Light-touch surface: show the lifecycle event so the user knows
      // something is happening during long agent runs. The full execution
      // tree lives elsewhere; here we just keep the banner alive.
      const tu = data as { event?: string; task?: { title?: string } };
      const label = tu.task?.title ? `${tu.task.title} — ${tu.event}` : tu.event;
      if (label) set({ statusMessage: label });
      break;
    }

    case 'generation_stopped': {
      set({
        status: 'connected',
        statusMessage: null,
      });
      break;
    }

    case 'error': {
      const errorMsg = (data as { message?: string }).message || 'An error occurred';
      set({
        status: 'error',
        error: errorMsg,
        statusMessage: null,
      });
      break;
    }

    default:
      // Ignore unknown message types
      break;
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  status: 'disconnected',
  statusMessage: null,
  error: null,
  wsManager: null,
  threads: {},
  currentThreadId: null,
  messageCache: {},
  isLoadingMessages: false,
  selectedModel: null,
  agentMode: false,
  helpMode: false,
  selectedCollections: [],
  selectedTools: [],

  connect: async () => {
    const state = get();

    // Get WebSocket URL from API service. The auth token is sent as an
    // Authorization header (see WebSocketManager) rather than a URL query
    // param, so it doesn't leak into logs/proxies.
    const wsUrl = apiService.getWebSocketUrl('/ws');
    const accessToken = useAuthStore.getState().session?.access_token;
    const headers = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined;
    const connectionKey = `${wsUrl}|${accessToken ?? ''}`;

    // Idempotent: a socket that is up, or on its way up, to the same target
    // is kept. Recreating it would cut off a reply that is streaming.
    if (
      state.wsManager &&
      connectionKey === activeConnectionKey &&
      LIVE_SOCKET_STATES.has(state.wsManager.getState())
    ) {
      return;
    }

    // Clean up existing connection
    if (state.wsManager) {
      state.wsManager.destroy();
    }
    activeConnectionKey = connectionKey;

    set({ status: 'connecting' });
    console.log('Connecting to chat WebSocket:', wsUrl);

    // Create WebSocket manager
    const wsManager = new WebSocketManager({
      url: wsUrl,
      headers,
      reconnect: true,
      reconnectInterval: 1000,
      reconnectDecay: 1.5,
      reconnectAttempts: 10,
      timeoutInterval: 30000,
    });

    // Advertise the client-side `ui_*` tools. The server exposes whatever the
    // manifest lists for the life of the connection, so it has to be re-sent on
    // every reconnect — not just the first open.
    const sendToolManifest = (): void => {
      const tools = MobileToolRegistry.getManifest();
      if (tools.length === 0) {
        return;
      }
      try {
        wsManager.send({ type: 'client_tools_manifest', tools });
      } catch (error) {
        console.error('Failed to send tool manifest:', error);
      }
    };

    // Set up callbacks
    wsManager.setCallbacks({
      onOpen: sendToolManifest,
      onStateChange: (newState: ConnectionState) => {
        const currentState = get();
        const wasGenerating =
          currentState.status === 'loading' || currentState.status === 'streaming';

        if (newState === 'connected') {
          // A reconnect clears socket errors, but a reply that was cut off
          // stays reported until the next send.
          const error = currentState.error === STREAM_LOST_ERROR ? STREAM_LOST_ERROR : null;
          if (wasGenerating) {
            // Don't override loading/streaming status when the socket opens
            set({ error, statusMessage: null });
          } else {
            set({ status: newState, error, statusMessage: null });
          }
          return;
        }

        if (wasGenerating && LOST_SOCKET_STATES.has(newState)) {
          // The reply in flight went with the socket. Say so instead of
          // spinning until the safety timeout.
          clearSafetyTimeout();
          set({ status: newState, error: STREAM_LOST_ERROR, statusMessage: null });
          return;
        }

        // Keep any error: a socket that gives up reports why through onError.
        set({ status: newState, statusMessage: null });
      },
      onMessage: (data: WebSocketMessageData) => {
        handleWebSocketMessage(data, set, get);
      },
      onError: (error: Error) => {
        console.error('WebSocket error:', error);
        set({ error: error.message });
      },
      onReconnecting: (attempt: number, maxAttempts: number) => {
        set({ statusMessage: `Reconnecting... (${attempt}/${maxAttempts})` });
      },
    });

    set({ wsManager, error: null });

    try {
      await wsManager.connect();
      console.log('Successfully connected to chat WebSocket');
    } catch (error) {
      console.error('Failed to connect to chat:', error);
      throw error;
    }
  },

  disconnect: () => {
    const { wsManager } = get();

    if (wsManager) {
      wsManager.disconnect();
      wsManager.destroy();
    }
    activeConnectionKey = null;

    clearSafetyTimeout();

    set({
      wsManager: null,
      status: 'disconnected',
      error: null,
      statusMessage: null,
    });
  },

  sendMessage: async (content: MessageContent[], text: string, mediaGeneration?: MediaGenerationRequest) => {
    const { wsManager, currentThreadId } = get();

    set({ error: null });

    if (!wsManager || !wsManager.isConnected()) {
      set({ error: 'Not connected to chat service' });
      return false;
    }

    // Ensure we have a thread
    let threadId = currentThreadId;
    if (!threadId) {
      threadId = await get().createNewThread();
    }

    // Create message for cache (optimistic update)
    const messageForCache: Message = {
      id: `local-${Date.now()}`,
      type: 'message',
      role: 'user',
      content: content,
      thread_id: threadId,
    };

    // Add to cache
    get().addMessageToCache(threadId, messageForCache);

    // Update thread title if first message
    const existingMessages = get().messageCache[threadId] || [];
    if (existingMessages.length === 1) {
      // First user message - update thread title
      const titleBase = text || 'New conversation';
      const newTitle = titleBase.substring(0, 50) + (titleBase.length > 50 ? '...' : '');
      set((state) => ({
        threads: {
          ...state.threads,
          [threadId]: {
            ...state.threads[threadId],
            title: newTitle,
            updated_at: new Date().toISOString(),
          },
        },
      }));
    }

    set({ status: 'loading' });

    // Create message to send
    const stateForSend = get();
    const messageToSend: ChatMessageRequest = {
      type: 'message',
      role: 'user',
      content: content,
      thread_id: threadId,
      model: stateForSend.selectedModel?.id,
      provider: stateForSend.selectedModel?.provider,
      agent_mode: stateForSend.agentMode || undefined,
      help_mode: stateForSend.helpMode || undefined,
      collections: stateForSend.selectedCollections.length
        ? stateForSend.selectedCollections
        : undefined,
      tools: stateForSend.selectedTools.length
        ? stateForSend.selectedTools
        : undefined,
      media_generation: mediaGeneration,
      // Which documents the user has open and focused, so the agent knows what
      // "this timeline" or "this sketch" means, and which ids the storyboard
      // `ui_*` tools may address. Omitted when nothing is open.
      ui_context: buildUiContext(),
    };

    // Cancel any prior safety timeout — otherwise rapid sends accumulate
    // timers and one can fire mid-stream of a later message, clobbering
    // the live `status: "loading"` flag.
    clearSafetyTimeout();

    try {
      wsManager.send(messageToSend);

      // Safety timeout - surface an error if the server never responds, rather
      // than silently dropping back to "connected" with no explanation.
      safetyTimeoutId = setTimeout(() => {
        safetyTimeoutId = null;
        const currentState = get();
        if (currentState.status === 'loading' || currentState.status === 'streaming') {
          console.warn('Generation timeout - surfacing error');
          set({
            status: 'error',
            statusMessage: null,
            error: 'The response timed out. Please try again.',
          });
        }
      }, 5 * 60 * 1000);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      // The composer keeps the draft for a retry, so drop the optimistic copy
      // rather than show a message the server never got.
      set((state) => ({
        status: wsManager.getState(),
        error: error instanceof Error ? error.message : 'Failed to send message',
        messageCache: {
          ...state.messageCache,
          [threadId]: (state.messageCache[threadId] ?? []).filter(
            (m) => m.id !== messageForCache.id
          ),
        },
      }));
      return false;
    }
  },

  stopGeneration: () => {
    const { wsManager, currentThreadId, status } = get();

    console.log('stopGeneration called:', {
      hasWsManager: !!wsManager,
      isConnected: wsManager?.isConnected(),
      currentThreadId,
      status,
    });

    // Cancel the safety timeout so it doesn't fire after the user stops.
    clearSafetyTimeout();

    if (!wsManager || !wsManager.isConnected() || !currentThreadId) {
      console.log('Cannot stop: not connected or no thread');
      return;
    }

    console.log('Sending stop signal');

    try {
      wsManager.send({ type: 'stop', thread_id: currentThreadId });
      set({
        status: 'connected',
        statusMessage: null,
      });
    } catch (error) {
      console.error('Failed to send stop signal:', error);
      set({
        error: 'Failed to stop generation',
        status: 'error',
      });
    }
  },

  /**
   * Creates a new thread locally.
   * 
   * Note: Threads are created client-side and auto-created on the server
   * when the first message is sent. This matches the web implementation
   * where the server auto-creates threads on first message.
   */
  createNewThread: async (title?: string) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const localThread: Thread = {
      id,
      title: title || 'New conversation',
      created_at: now,
      updated_at: now,
    } as Thread;

    set((state) => ({
      threads: {
        ...state.threads,
        [id]: localThread,
      },
      currentThreadId: id,
      messageCache: {
        ...state.messageCache,
        [id]: [],
      },
    }));

    return id;
  },

  /**
   * Loads a thread from the server (e.g. after the user picks one from the
   * Threads screen). Falls back to creating a stub local thread entry if the
   * server fetch fails so the UI can still render the conversation.
   */
  loadThreadFromServer: async (threadId: string) => {
    try {
      const remote = await apiService.getThread(threadId);
      const localThread: Thread = {
        id: remote.id,
        title: remote.title || 'Conversation',
        created_at: remote.created_at,
        updated_at: remote.updated_at,
      } as Thread;
      set((state) => ({
        threads: { ...state.threads, [remote.id]: localThread },
        currentThreadId: remote.id,
        messageCache: state.messageCache[remote.id]
          ? state.messageCache
          : { ...state.messageCache, [remote.id]: [] },
      }));
    } catch (error) {
      console.error('Failed to load thread from server:', error);
      // Optimistically register a stub so the chat screen can still render
      const now = new Date().toISOString();
      const stub: Thread = {
        id: threadId,
        title: 'Conversation',
        created_at: now,
        updated_at: now,
      } as Thread;
      set((state) => ({
        threads: { ...state.threads, [threadId]: stub },
        currentThreadId: threadId,
        messageCache: state.messageCache[threadId]
          ? state.messageCache
          : { ...state.messageCache, [threadId]: [] },
      }));
    }
  },

  addMessageToCache: (threadId: string, message: Message) => {
    set((state) => {
      const existingMessages = state.messageCache[threadId] || [];
      return {
        messageCache: {
          ...state.messageCache,
          [threadId]: [...existingMessages, message],
        },
      };
    });
  },

  setSelectedModel: (model: LanguageModel) => {
    set({ selectedModel: model });
  },

  setAgentMode: (enabled: boolean) => {
    set({ agentMode: enabled });
  },

  setHelpMode: (enabled: boolean) => {
    set({ helpMode: enabled });
  },

  setSelectedCollections: (collections: string[]) => {
    set({ selectedCollections: collections });
  },

  setSelectedTools: (tools: string[]) => {
    set({ selectedTools: tools });
  },
}));
