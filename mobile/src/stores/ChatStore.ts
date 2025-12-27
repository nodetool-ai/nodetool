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
import {
  ChatStatus,
  ConnectionState,
  Message,
  MessageContent,
  Thread,
  Chunk,
  ChatMessageRequest,
  WebSocketMessageData,
  LanguageModel,
} from '../types';

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

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (content: MessageContent[], text: string) => Promise<void>;
  stopGeneration: () => void;
  createNewThread: (title?: string) => Promise<string>;
  switchThread: (threadId: string) => void;
  getCurrentMessages: () => Message[];
  resetMessages: () => void;
  setSelectedModel: (model: LanguageModel) => void;

  // Internal actions
  addMessageToCache: (threadId: string, message: Message) => void;
  setStatus: (status: ChatStatus) => void;
  setError: (error: string | null) => void;
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
    // Only process certain messages while stopping
    if (!['generation_stopped', 'error', 'job_update'].includes(data.type)) {
      return;
    }
  }

  switch (data.type) {
    case 'message': {
      const msg = data as Message;
      const msgThreadId = msg.thread_id ?? threadId;
      if (!msgThreadId) break;

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
      const chunk = data as Chunk;
      if (!threadId) break;

      const messages = state.messageCache[threadId] || [];
      const lastMessage = messages[messages.length - 1];

      if (lastMessage?.role === 'assistant') {
        // Append to existing assistant message
        const updatedMessage: Message = {
          ...lastMessage,
          content: (lastMessage.content || '') + chunk.content,
        };
        set((s) => ({
          status: chunk.done ? 'connected' : 'streaming',
          messageCache: {
            ...s.messageCache,
            [threadId]: [...messages.slice(0, -1), updatedMessage],
          },
        }));
      } else {
        // Create new assistant message
        const newMessage: Message = {
          id: `local-stream-${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: chunk.content,
        };
        set((s) => ({
          status: chunk.done ? 'connected' : 'streaming',
          messageCache: {
            ...s.messageCache,
            [threadId]: [...messages, newMessage],
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

  connect: async () => {
    const state = get();

    // Clean up existing connection
    if (state.wsManager) {
      state.wsManager.destroy();
    }

    // Get WebSocket URL from API service
    const wsUrl = apiService.getWebSocketUrl('/ws/chat');
    console.log('Connecting to chat WebSocket:', wsUrl);

    // Create WebSocket manager
    const wsManager = new WebSocketManager({
      url: wsUrl,
      reconnect: true,
      reconnectInterval: 1000,
      reconnectDecay: 1.5,
      reconnectAttempts: 10,
      timeoutInterval: 30000,
    });

    // Set up callbacks
    wsManager.setCallbacks({
      onStateChange: (newState: ConnectionState) => {
        const currentState = get();
        // Don't override loading/streaming status when WebSocket events occur
        if (
          newState === 'connected' &&
          (currentState.status === 'loading' || currentState.status === 'streaming')
        ) {
          set({ error: null, statusMessage: null });
        } else {
          set({ status: newState, error: null, statusMessage: null });
        }
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

    set({
      wsManager: null,
      status: 'disconnected',
      error: null,
      statusMessage: null,
    });
  },

  sendMessage: async (content: MessageContent[], text: string) => {
    const { wsManager, currentThreadId } = get();

    set({ error: null });

    if (!wsManager || !wsManager.isConnected()) {
      set({ error: 'Not connected to chat service' });
      return;
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
    const messageToSend: ChatMessageRequest = {
      type: 'message',
      role: 'user',
      content: content,
      thread_id: threadId,
      model: get().selectedModel?.id,
      provider: get().selectedModel?.provider,
    };

    try {
      wsManager.send(messageToSend);

      // Safety timeout - reset status if no response
      setTimeout(() => {
        const currentState = get();
        if (currentState.status === 'loading' || currentState.status === 'streaming') {
          console.warn('Generation timeout - resetting status');
          set({
            status: 'connected',
            statusMessage: null,
          });
        }
      }, 60000);
    } catch (error) {
      console.error('Failed to send message:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to send message',
      });
      throw error;
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

  switchThread: (threadId: string) => {
    const exists = !!get().threads[threadId];
    if (!exists) return;

    set({ currentThreadId: threadId });
  },

  getCurrentMessages: () => {
    const { currentThreadId, messageCache } = get();
    if (!currentThreadId) return [];
    return messageCache[currentThreadId] || [];
  },

  /**
   * Clears all messages in the current thread.
   * Reserved for future use (e.g., reset conversation feature).
   */
  resetMessages: () => {
    const threadId = get().currentThreadId;
    if (threadId) {
      set((state) => ({
        messageCache: {
          ...state.messageCache,
          [threadId]: [],
        },
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

  setStatus: (status: ChatStatus) => {
    set({ status });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  setSelectedModel: (model: LanguageModel) => {
    set({ selectedModel: model });
  },
}));
