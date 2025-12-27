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
  lastUsedThreadId: string | null;
  isLoadingThreads: boolean;
  threadsLoaded: boolean;

  // Message cache
  messageCache: Record<string, Message[]>;
  messageCursors: Record<string, string | null>;
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
  deleteThread: (threadId: string) => Promise<void>;
  fetchThreads: () => Promise<void>;
  fetchThread: (threadId: string) => Promise<Thread | null>;
  loadMessages: (threadId: string, cursor?: string) => Promise<Message[]>;
  getCurrentMessages: () => Message[];
  resetMessages: () => void;
  setSelectedModel: (model: LanguageModel) => void;
  setLastUsedThreadId: (threadId: string | null) => void;
  clearMessageCache: (threadId: string) => void;
  getThreadList: () => Thread[];

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
  lastUsedThreadId: null,
  isLoadingThreads: false,
  threadsLoaded: false,
  messageCache: {},
  messageCursors: {},
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
      lastUsedThreadId: id,
      messageCache: {
        ...state.messageCache,
        [id]: [],
      },
    }));

    return id;
  },

  /**
   * Fetches all threads from the API.
   */
  fetchThreads: async () => {
    set({ isLoadingThreads: true });
    try {
      const data = await apiService.getThreads();
      
      // Convert array to Record keyed by thread ID
      const threadsRecord: Record<string, Thread> = {};
      (data.threads || []).forEach((thread: Thread) => {
        threadsRecord[thread.id] = thread;
      });

      set({ threads: threadsRecord, threadsLoaded: true });
    } catch (error) {
      console.error('Failed to fetch threads:', error);
      set({ threadsLoaded: true }); // Mark as loaded even on error
    } finally {
      set({ isLoadingThreads: false });
    }
  },

  /**
   * Fetches a single thread from the API.
   */
  fetchThread: async (threadId: string) => {
    try {
      const data = await apiService.getThread(threadId);
      
      set((state) => ({
        threads: {
          ...state.threads,
          [threadId]: data,
        },
      }));

      return data;
    } catch (error) {
      console.error('Failed to fetch thread:', error);
      return null;
    }
  },

  /**
   * Switches to an existing thread and loads its messages.
   * Note: loadMessages is intentionally not awaited to avoid blocking the UI.
   * Messages will be loaded asynchronously and the UI will update via state changes.
   */
  switchThread: (threadId: string) => {
    const exists = !!get().threads[threadId];
    if (!exists) return;

    set({ currentThreadId: threadId, lastUsedThreadId: threadId });
    // Load messages asynchronously - errors are handled within loadMessages
    get().loadMessages(threadId).catch((error) => {
      console.error('Failed to load messages on thread switch:', error);
    });
  },

  /**
   * Deletes a thread and its messages.
   */
  deleteThread: async (threadId: string) => {
    try {
      await apiService.deleteThread(threadId);

      // Update local state
      set((state) => {
        const { [threadId]: deleted, ...remainingThreads } = state.threads;
        const { [threadId]: deletedCache, ...remainingCache } = state.messageCache;
        const { [threadId]: deletedCursor, ...remainingCursors } = state.messageCursors;

        const newState: Partial<ChatState> = {
          threads: remainingThreads,
          messageCache: remainingCache,
          messageCursors: remainingCursors,
        };

        // If deleting current thread, switch to another or create new
        if (state.currentThreadId === threadId) {
          const threadIds = Object.keys(remainingThreads);
          if (threadIds.length > 0) {
            const newCurrentThreadId = threadIds[threadIds.length - 1];
            newState.currentThreadId = newCurrentThreadId;
            newState.lastUsedThreadId = newCurrentThreadId;
            // Auto-load messages for the new current thread using Promise.resolve
            // to defer execution until after state update completes
            Promise.resolve().then(() => {
              get().loadMessages(newCurrentThreadId).catch((error) => {
                console.error('Failed to load messages after thread deletion:', error);
              });
            });
          } else {
            newState.currentThreadId = null;
            newState.lastUsedThreadId = null;
          }
        } else if (state.lastUsedThreadId === threadId) {
          const threadIds = Object.keys(remainingThreads);
          newState.lastUsedThreadId = threadIds.length ? threadIds[threadIds.length - 1] : null;
        }

        return newState as ChatState;
      });

      // If no threads remain, create a new one
      const { threads, currentThreadId } = get();
      if (!currentThreadId && Object.keys(threads).length === 0) {
        await get().createNewThread();
      }
    } catch (error) {
      console.error('Failed to delete thread:', error);
      throw error;
    }
  },

  /**
   * Loads messages for a thread from the API.
   */
  loadMessages: async (threadId: string, cursor?: string) => {
    const { messageCache, isLoadingMessages } = get();

    // If already loading, return cached messages
    if (isLoadingMessages) {
      return messageCache[threadId] || [];
    }

    // If no cursor provided and we have cached messages, return them
    if (!cursor && messageCache[threadId]) {
      return messageCache[threadId];
    }

    set({ isLoadingMessages: true, error: null });

    try {
      const data = await apiService.getMessages(threadId, cursor);

      const messages = data.messages || [];
      const nextCursor = data.next;

      // Calculate updated messages based on whether we're paginating
      const existingMessages = get().messageCache[threadId] || [];
      const updatedMessages = cursor
        ? [...existingMessages, ...messages]
        : messages;

      set((state) => ({
        messageCache: {
          ...state.messageCache,
          [threadId]: updatedMessages,
        },
        messageCursors: {
          ...state.messageCursors,
          [threadId]: nextCursor,
        },
        isLoadingMessages: false,
      }));

      // Return the updated messages from state
      return updatedMessages;
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load messages',
        isLoadingMessages: false,
      });
      // Return current state's cache instead of stale reference
      return get().messageCache[threadId] || [];
    }
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

  clearMessageCache: (threadId: string) => {
    set((state) => {
      const { [threadId]: deleted, ...remainingCache } = state.messageCache;
      const { [threadId]: deletedCursor, ...remainingCursors } = state.messageCursors;

      return {
        messageCache: remainingCache,
        messageCursors: remainingCursors,
      };
    });
  },

  setLastUsedThreadId: (threadId: string | null) => {
    set({ lastUsedThreadId: threadId });
  },

  /**
   * Returns a list of threads sorted by updated_at date (most recent first).
   */
  getThreadList: () => {
    const { threads } = get();
    return Object.values(threads).sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      return dateB - dateA;
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
