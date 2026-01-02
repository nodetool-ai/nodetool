/**
 * Zustand store for Chrome extension state management.
 * Handles server connection, chat messages, and settings.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ServerConfig,
  ChatMessage,
  ConnectionStatus,
  Thread,
  PageContext
} from '../types';

const DEFAULT_SERVER_URL = 'http://localhost:7777';
const DEFAULT_MODEL = 'gpt-4o-mini';

interface ExtensionState {
  // Server configuration
  serverConfig: ServerConfig;
  setServerConfig: (config: Partial<ServerConfig>) => void;

  // Connection state
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
  connectionError: string | null;
  setConnectionError: (error: string | null) => void;

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;
  setCurrentThreadId: (id: string | null) => void;
  addThread: (thread: Thread) => void;
  deleteThread: (id: string) => void;
  createNewThread: (threadId?: string) => string;

  // Message management
  messageCache: Record<string, ChatMessage[]>;
  addMessage: (threadId: string, message: ChatMessage) => void;
  updateLastMessage: (threadId: string, content: string, append?: boolean) => void;
  clearMessages: (threadId: string) => void;
  getCurrentMessages: () => ChatMessage[];

  // Chat state
  isStreaming: boolean;
  setIsStreaming: (streaming: boolean) => void;
  currentModel: string;
  setCurrentModel: (model: string) => void;

  // Settings
  autoIncludeContext: boolean;
  setAutoIncludeContext: (include: boolean) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Page context
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;

  // Settings panel
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}

export const useExtensionStore = create<ExtensionState>()(
  persist(
    (set, get) => ({
      // Server configuration
      serverConfig: {
        url: DEFAULT_SERVER_URL,
        authProvider: 'local',
        autoConnect: true,
        reconnectAttempts: 5
      },
      setServerConfig: (config) =>
        set((state) => ({
          serverConfig: { ...state.serverConfig, ...config }
        })),

      // Connection state
      connectionStatus: 'disconnected',
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      connectionError: null,
      setConnectionError: (error) => set({ connectionError: error }),

      // Thread management
      threads: {},
      currentThreadId: null,
      setCurrentThreadId: (id) => set({ currentThreadId: id }),
      addThread: (thread) =>
        set((state) => ({
          threads: { ...state.threads, [thread.id]: thread }
        })),
      deleteThread: (id) =>
        set((state) => {
          const { [id]: _, ...remainingThreads } = state.threads;
          const { [id]: __, ...remainingMessages } = state.messageCache;
          return {
            threads: remainingThreads,
            messageCache: remainingMessages,
            currentThreadId: state.currentThreadId === id ? null : state.currentThreadId
          };
        }),
      createNewThread: (threadId) => {
        const id = threadId || `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const newThread: Thread = {
          id,
          title: 'New Chat',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        set((state) => ({
          threads: { ...state.threads, [id]: newThread },
          currentThreadId: id,
          messageCache: { ...state.messageCache, [id]: [] }
        }));
        return id;
      },

      // Message management
      messageCache: {},
      addMessage: (threadId, message) =>
        set((state) => {
          const existingMessages = state.messageCache[threadId] || [];
          // Prevent duplicate messages with same ID
          if (message.id && existingMessages.some(m => m.id === message.id)) {
            return state;
          }
          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...existingMessages, message]
            }
          };
        }),
      updateLastMessage: (threadId, content, append = true) =>
        set((state) => {
          const messages = state.messageCache[threadId] || [];
          if (messages.length === 0) return state;

          const lastMessage = messages[messages.length - 1];
          const updatedMessage: ChatMessage = {
            ...lastMessage,
            content: append
              ? (typeof lastMessage.content === 'string' ? lastMessage.content : '') + content
              : content
          };

          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages.slice(0, -1), updatedMessage]
            }
          };
        }),
      clearMessages: (threadId) =>
        set((state) => ({
          messageCache: {
            ...state.messageCache,
            [threadId]: []
          }
        })),
      getCurrentMessages: () => {
        const state = get();
        if (!state.currentThreadId) return [];
        return state.messageCache[state.currentThreadId] || [];
      },

      // Chat state
      isStreaming: false,
      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
      currentModel: DEFAULT_MODEL,
      setCurrentModel: (model) => set({ currentModel: model }),

      // Settings
      autoIncludeContext: false,
      setAutoIncludeContext: (include) => set({ autoIncludeContext: include }),
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // Page context
      pageContext: null,
      setPageContext: (context) => set({ pageContext: context }),

      // Settings panel
      isSettingsOpen: false,
      setIsSettingsOpen: (open) => set({ isSettingsOpen: open })
    }),
    {
      name: 'nodetool-extension-storage',
      partialize: (state) => ({
        serverConfig: state.serverConfig,
        threads: state.threads,
        currentThreadId: state.currentThreadId,
        messageCache: state.messageCache,
        currentModel: state.currentModel,
        autoIncludeContext: state.autoIncludeContext,
        theme: state.theme
      })
    }
  )
);

export default useExtensionStore;
