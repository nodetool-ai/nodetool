/**
 * Global chat state and WebSocket bridge for Chrome extension.
 *
 * Connects to the Nodetool server WebSocket endpoint for chat functionality.
 * Adapted from web/src/stores/GlobalChatStore.ts for extension context.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import log from "loglevel";

import {
  Message,
  TaskUpdate,
  PlanningUpdate,
  Thread,
  LanguageModel
} from "./ApiTypes";
import { apiClient } from "./ApiClient";
import { DEFAULT_MODEL } from "../config/constants";
import {
  WebSocketManager,
  ConnectionState
} from "../lib/websocket/WebSocketManager";
import {
  handleChatWebSocketMessage,
  MsgpackData
} from "../core/chat/chatProtocol";
import { uuidv4 } from "./uuidv4";
import { getChatUrl } from "./BASE_URL";
import { BrowserToolRegistry } from "../lib/tools/browserTools";

// Include additional runtime statuses used during message streaming
type ChatStatus =
  | ConnectionState
  | "loading"
  | "streaming"
  | "error"
  | "stopping";

export interface GlobalChatState {
  // Server configuration
  serverUrl: string;
  setServerUrl: (url: string) => void;
  apiKey: string | null;
  setApiKey: (key: string | null) => void;

  // Connection state
  status: ChatStatus;
  statusMessage: string | null;
  progress: { current: number; total: number };
  error: string | null;
  workflowId: string | null;
  threadWorkflowId: Record<string, string | null>;

  // Tool call runtime UI state
  currentRunningToolCallId: string | null;
  currentToolMessage: string | null;

  // WebSocket manager
  wsManager: WebSocketManager | null;
  socket: WebSocket | null;

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;
  lastUsedThreadId: string | null;
  isLoadingThreads: boolean;
  threadsLoaded: boolean;

  // Message caching
  messageCache: Record<string, Message[]>;
  messageCursors: Record<string, string | null>;
  isLoadingMessages: boolean;

  // Agent mode
  agentMode: boolean;
  setAgentMode: (enabled: boolean) => void;

  // Selections
  selectedModel: LanguageModel;
  setSelectedModel: (model: LanguageModel) => void;
  selectedTools: string[];
  setSelectedTools: (tools: string[]) => void;
  selectedCollections: string[];
  setSelectedCollections: (collections: string[]) => void;

  // Planning updates
  currentPlanningUpdate: PlanningUpdate | null;
  setPlanningUpdate: (update: PlanningUpdate | null) => void;

  // Task updates
  currentTaskUpdate: TaskUpdate | null;
  setTaskUpdate: (update: TaskUpdate | null) => void;
  currentTaskUpdateThreadId: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;

  // Thread actions
  fetchThreads: () => Promise<void>;
  fetchThread: (threadId: string) => Promise<Thread | null>;
  createNewThread: (title?: string) => Promise<string>;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  setLastUsedThreadId: (threadId: string | null) => void;
  getCurrentMessages: () => Message[];
  loadMessages: (threadId: string, cursor?: string) => Promise<Message[]>;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  stopGeneration: () => void;

  // Message cache management
  addMessageToCache: (threadId: string, message: Message) => void;
  clearMessageCache: (threadId: string) => void;
}

function buildDefaultLanguageModel(): LanguageModel {
  return {
    type: "language_model",
    provider: "openai",
    id: DEFAULT_MODEL,
    name: DEFAULT_MODEL
  };
}

const useGlobalChatStore = create<GlobalChatState>()(
  persist<GlobalChatState>(
    (set, get) => ({
      // Server configuration
      serverUrl: "http://localhost:8000",
      setServerUrl: (url: string) => {
        set({ serverUrl: url });
        apiClient.setBaseUrl(url);
      },
      apiKey: null,
      setApiKey: (key: string | null) => {
        set({ apiKey: key });
        apiClient.setApiKey(key || undefined);
      },

      // Connection state
      status: "disconnected",
      statusMessage: null,
      progress: { current: 0, total: 0 },
      error: null,
      workflowId: null,
      threadWorkflowId: {},
      wsManager: null,
      socket: null,
      currentRunningToolCallId: null,
      currentToolMessage: null,

      // Thread state
      threads: {} as Record<string, Thread>,
      currentThreadId: null as string | null,
      lastUsedThreadId: null as string | null,
      isLoadingThreads: false,
      threadsLoaded: false,

      // Message cache
      messageCache: {},
      messageCursors: {},
      isLoadingMessages: false,

      // Agent mode
      agentMode: false,
      setAgentMode: (enabled: boolean) => set({ agentMode: enabled }),

      // Selections
      selectedModel: buildDefaultLanguageModel(),
      setSelectedModel: (model: LanguageModel) => {
        set({ selectedModel: model });
      },
      selectedTools: [],
      setSelectedTools: (tools: string[]) => set({ selectedTools: tools }),
      selectedCollections: [],
      setSelectedCollections: (collections: string[]) =>
        set({ selectedCollections: collections }),

      // Planning updates
      currentPlanningUpdate: null,
      setPlanningUpdate: (update: PlanningUpdate | null) =>
        set({ currentPlanningUpdate: update }),

      // Task updates
      currentTaskUpdate: null,
      setTaskUpdate: (update: TaskUpdate | null) =>
        set({ currentTaskUpdate: update }),
      currentTaskUpdateThreadId: null,

      connect: async () => {
        log.info("Connecting to global chat");

        const state = get();

        // Clean up existing connection
        if (state.wsManager) {
          state.wsManager.destroy();
        }

        // Load threads if not already loaded
        if (!state.threadsLoaded) {
          await get().fetchThreads();
        }

        // Get WebSocket URL
        const wsUrl = getChatUrl(state.serverUrl);
        const finalUrl = state.apiKey ? `${wsUrl}?api_key=${state.apiKey}` : wsUrl;

        // Create WebSocket manager
        const wsManager = new WebSocketManager({
          url: finalUrl,
          reconnect: true,
          reconnectInterval: 1000,
          reconnectDecay: 1.5,
          reconnectAttempts: 10,
          timeoutInterval: 30000,
          binaryType: "arraybuffer"
        });

        // Set up event handlers
        wsManager.on("stateChange", (newState: unknown) => {
          const currentState = get();
          const state = newState as ConnectionState;
          if (state === "connected" && currentState.status === "loading") {
            set({
              error: null,
              statusMessage: null
            });
          } else {
            set({ status: state });

            if (state === "connected") {
              set({
                error: null,
                statusMessage: null
              });
            }
          }
        });

        wsManager.on("reconnecting", (attempt: unknown, maxAttempts: unknown) => {
          set({
            statusMessage: `Reconnecting... (attempt ${attempt}/${maxAttempts})`
          });
        });

        wsManager.on("message", (data: unknown) => {
          handleChatWebSocketMessage(data as MsgpackData, set, get);
        });

        wsManager.on("open", () => {
          set({ socket: wsManager.getWebSocket() });
          
          // Register browser tools with the server
          const browserToolsManifest = BrowserToolRegistry.getManifest();
          if (browserToolsManifest.length > 0) {
            log.info(`Registering ${browserToolsManifest.length} browser tools with server`);
            wsManager.send({
              command: "register_client_tools",
              data: {
                tools: browserToolsManifest
              }
            });
          }
        });

        wsManager.on("error", (error: unknown) => {
          log.error("WebSocket error:", error);
          set({
            error: (error as Error).message
          });
        });

        wsManager.on("close", (code: unknown) => {
          set({ socket: null });
          const closeCode = code as number;
          if (closeCode === 1008 || closeCode === 4001 || closeCode === 4003) {
            set({
              error: "Authentication failed. Please check your API key."
            });
          }
        });

        // Store the manager and connect
        set({
          wsManager,
          error: null
        });

        try {
          await wsManager.connect();
          log.info("Successfully connected to global chat");
        } catch (error) {
          log.error("Failed to connect to global chat:", error);
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
          socket: null,
          status: "disconnected",
          error: null,
          statusMessage: null
        });
      },

      sendMessage: async (message: Message) => {
        const {
          wsManager,
          currentThreadId,
          workflowId,
          agentMode,
          selectedModel,
          selectedTools,
          selectedCollections
        } = get();

        set({ error: null });

        if (!wsManager || !wsManager.isConnected()) {
          set({ error: "Not connected to chat service" });
          return;
        }

        // Ensure we have a thread
        let threadId = currentThreadId;
        if (!threadId) {
          threadId = await get().createNewThread();
        }

        set((state) => ({
          threadWorkflowId: {
            ...state.threadWorkflowId,
            [threadId as string]: workflowId ?? null
          }
        }));

        // Prepare message for cache
        const messageForCache: Message = {
          ...message,
          thread_id: threadId,
          agent_mode: agentMode
        };

        // Build the chat_message command data
        const chatMessageData = {
          ...message,
          workflow_id: message.workflow_id ?? workflowId ?? null,
          thread_id: threadId,
          agent_mode: agentMode,
          model: selectedModel?.id,
          provider: selectedModel?.provider,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          collections:
            selectedCollections.length > 0 ? selectedCollections : undefined
        };

        // Wrap in chat_message command structure
        const commandMessage = {
          command: "chat_message",
          data: chatMessageData
        };

        // Check if this is the first user message
        const existingMessages = get().messageCache[threadId] || [];
        const userMessageCount = existingMessages.filter(
          (msg) => msg.role === "user"
        ).length;
        const isFirstUserMessage =
          message.role === "user" && userMessageCount === 0;

        // Add message to cache optimistically
        get().addMessageToCache(threadId, messageForCache);

        // Auto-generate title from first user message
        if (isFirstUserMessage) {
          const state = get();
          const thread = state.threads[threadId];
          if (thread) {
            let contentText = "";
            if (typeof message.content === "string") {
              contentText = message.content;
            } else if (Array.isArray(message.content)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const firstText = (message.content as any[]).find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (c: any) => c?.type === "text" && typeof c.text === "string"
              );
              contentText = firstText?.text || "";
            }
            const titleBase = contentText || "New conversation";
            const newTitle =
              titleBase.substring(0, 50) + (titleBase.length > 50 ? "..." : "");
            set((s) => ({
              threads: {
                ...s.threads,
                [threadId]: {
                  ...s.threads[threadId],
                  title: newTitle,
                  updated_at: new Date().toISOString()
                }
              }
            }));
          }
        }

        set({ status: "loading" });

        try {
          wsManager.send(commandMessage);

          // Safety timeout
          setTimeout(() => {
            const currentState = get();
            if (
              currentState.status === "loading" ||
              currentState.status === "streaming"
            ) {
              log.warn("Generation timeout - resetting status to connected");
              set({
                status: "connected",
                progress: { current: 0, total: 0 },
                statusMessage: null,
                currentPlanningUpdate: null,
                currentTaskUpdate: null,
                currentTaskUpdateThreadId: null
              });
            }
          }, 60000);
        } catch (error) {
          log.error("Failed to send message:", error);
          set({
            error:
              error instanceof Error ? error.message : "Failed to send message"
          });
          throw error;
        }
      },

      resetMessages: () => {
        const threadId = get().currentThreadId;
        if (threadId) {
          set((state) => ({
            messageCache: {
              ...state.messageCache,
              [threadId]: []
            }
          }));
        }
      },

      fetchThreads: async () => {
        set({ isLoadingThreads: true });
        try {
          const { data, error } = await apiClient.getThreads();
          if (error) {
            throw new Error(error.detail?.[0]?.msg || "Failed to fetch threads");
          }

          // Convert array to Record keyed by thread ID
          const threadsRecord: Record<string, Thread> = {};
          data?.threads.forEach((thread) => {
            threadsRecord[thread.id] = thread;
          });

          set({ threads: threadsRecord, threadsLoaded: true });
        } catch (error) {
          log.error("Failed to fetch threads:", error);
          set({ threadsLoaded: true });
        } finally {
          set({ isLoadingThreads: false });
        }
      },

      fetchThread: async (threadId: string) => {
        try {
          const { data, error } = await apiClient.getThread(threadId);
          if (error) {
            throw new Error(error.detail?.[0]?.msg || "Failed to fetch thread");
          }

          if (data) {
            set((state) => ({
              threads: {
                ...state.threads,
                [threadId]: data
              }
            }));
          }

          return data || null;
        } catch (error) {
          log.error("Failed to fetch thread:", error);
          return null;
        }
      },

      createNewThread: async (title?: string) => {
        const id = uuidv4();
        const now = new Date().toISOString();
        const localThread: Thread = {
          id,
          title: title || "New conversation",
          created_at: now,
          updated_at: now
        };

        set((state) => ({
          threads: {
            ...state.threads,
            [id]: localThread
          },
          currentThreadId: id,
          lastUsedThreadId: id,
          threadWorkflowId: {
            ...state.threadWorkflowId,
            [id]: state.workflowId ?? null
          },
          messageCache: {
            ...state.messageCache,
            [id]: []
          }
        }));

        return id;
      },

      switchThread: (threadId: string) => {
        const exists = !!get().threads[threadId];
        if (!exists) return;
        set((state) => ({
          currentThreadId: threadId,
          lastUsedThreadId: threadId,
          workflowId: state.threadWorkflowId[threadId] ?? state.workflowId
        }));
        get().loadMessages(threadId);
      },

      deleteThread: async (threadId: string) => {
        try {
          const { error } = await apiClient.deleteThread(threadId);
          if (error) {
            throw new Error(error.detail?.[0]?.msg || "Failed to delete thread");
          }

          // Update local state
          set((state) => {
            const { [threadId]: _deleted, ...remainingThreads } = state.threads;
            const { [threadId]: _deletedCache, ...remainingCache } =
              state.messageCache;
            const { [threadId]: _deletedCursor, ...remainingCursors } =
              state.messageCursors;

            const newState: Partial<GlobalChatState> = {
              threads: remainingThreads,
              messageCache: remainingCache,
              messageCursors: remainingCursors
            };

            if (state.currentThreadId === threadId) {
              const threadIds = Object.keys(remainingThreads);
              if (threadIds.length > 0) {
                const newCurrentThreadId = threadIds[threadIds.length - 1];
                newState.currentThreadId = newCurrentThreadId;
                newState.lastUsedThreadId = newCurrentThreadId;
                setTimeout(() => get().loadMessages(newCurrentThreadId), 0);
              } else {
                newState.currentThreadId = null;
                newState.lastUsedThreadId = null;
              }
            } else if (state.lastUsedThreadId === threadId) {
              const threadIds = Object.keys(remainingThreads);
              newState.lastUsedThreadId = threadIds.length
                ? threadIds[threadIds.length - 1]
                : null;
            }

            return newState as GlobalChatState;
          });

          // If no threads remain, create a new one
          const { threads, currentThreadId } = get();
          if (!currentThreadId && Object.keys(threads).length === 0) {
            await get().createNewThread();
          }
        } catch (error) {
          log.error("Failed to delete thread:", error);
          throw error;
        }
      },

      setLastUsedThreadId: (threadId: string | null) =>
        set({ lastUsedThreadId: threadId }),

      getCurrentMessages: () => {
        const { currentThreadId, messageCache } = get();
        if (!currentThreadId) {
          return [];
        }
        return messageCache[currentThreadId] || [];
      },

      loadMessages: async (threadId: string, cursor?: string) => {
        const { messageCache, isLoadingMessages } = get();

        if (isLoadingMessages) {
          return messageCache[threadId] || [];
        }

        if (!cursor && messageCache[threadId]) {
          return messageCache[threadId];
        }

        set({ isLoadingMessages: true, error: null });

        try {
          const { data, error } = await apiClient.getMessages(
            threadId,
            cursor,
            100
          );

          if (error) {
            throw new Error(error.detail?.[0]?.msg || "Failed to load messages");
          }

          const messages = data?.messages || [];
          const nextCursor = data?.next;

          set((state) => {
            const existingMessages = state.messageCache[threadId] || [];
            const updatedMessages = cursor
              ? [...existingMessages, ...messages]
              : messages;

            return {
              messageCache: {
                ...state.messageCache,
                [threadId]: updatedMessages
              },
              messageCursors: {
                ...state.messageCursors,
                [threadId]: nextCursor || null
              },
              isLoadingMessages: false
            };
          });

          return cursor
            ? [...(messageCache[threadId] || []), ...messages]
            : messages;
        } catch (error) {
          log.error("Failed to load messages:", error);
          set({
            error:
              error instanceof Error
                ? error.message
                : "Failed to load messages",
            isLoadingMessages: false
          });
          return messageCache[threadId] || [];
        }
      },

      updateThreadTitle: async (threadId: string, title: string) => {
        // Optimistically update local state
        set((state) => {
          const thread = state.threads[threadId];
          if (thread) {
            return {
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  title,
                  updated_at: new Date().toISOString()
                }
              }
            } as Partial<GlobalChatState>;
          }
          return state;
        });

        // Best-effort server update
        try {
          await apiClient.updateThread(threadId, { title });
        } catch (error) {
          log.error("Failed to update thread title:", error);
        }
      },

      addMessageToCache: (threadId: string, message: Message) => {
        set((state) => {
          const existingMessages = state.messageCache[threadId] || [];
          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...existingMessages, message]
            }
          };
        });
      },

      clearMessageCache: (threadId: string) => {
        set((state) => {
          const { [threadId]: _deleted, ...remainingCache } = state.messageCache;
          const { [threadId]: _deletedCursor, ...remainingCursors } =
            state.messageCursors;

          return {
            messageCache: remainingCache,
            messageCursors: remainingCursors
          };
        });
      },

      stopGeneration: () => {
        const { wsManager, currentThreadId, status } = get();

        log.debug("stopGeneration called:", {
          hasWsManager: !!wsManager,
          isConnected: wsManager?.isConnected(),
          currentThreadId,
          status
        });

        if (!wsManager || !wsManager.isConnected() || !currentThreadId) {
          return;
        }

        log.info("Sending stop signal to workflow");

        try {
          wsManager.send({
            command: "stop",
            data: { thread_id: currentThreadId }
          });

          set({
            status: "connected",
            progress: { current: 0, total: 0 },
            statusMessage: null,
            currentPlanningUpdate: null,
            currentTaskUpdate: null,
            currentTaskUpdateThreadId: null
          });
        } catch (error) {
          log.error("Failed to send stop signal:", error);
          set({
            error: "Failed to stop generation",
            status: "error",
            statusMessage: null
          });
        }
      }
    }),
    {
      name: "global-chat-storage-extension",
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        apiKey: state.apiKey,
        threads: state.threads || {},
        lastUsedThreadId: state.lastUsedThreadId,
        selectedModel: state.selectedModel,
        selectedTools: state.selectedTools,
        selectedCollections: state.selectedCollections,
        agentMode: state.agentMode
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.threads) {
            state.threads = {};
          }
          state.messageCache = {};
          state.messageCursors = {};
          state.isLoadingMessages = false;
          state.isLoadingThreads = false;

          if (!state.selectedTools) state.selectedTools = [];
          if (!state.selectedCollections) state.selectedCollections = [];
          if (!state.selectedModel)
            state.selectedModel = buildDefaultLanguageModel();
          if (typeof state.lastUsedThreadId === "undefined")
            state.lastUsedThreadId = null;
            
          // Update API client with stored settings
          if (state.serverUrl) {
            apiClient.setBaseUrl(state.serverUrl);
          }
          if (state.apiKey) {
            apiClient.setApiKey(state.apiKey);
          }
        }
      }
    }
  )
);

export default useGlobalChatStore;
