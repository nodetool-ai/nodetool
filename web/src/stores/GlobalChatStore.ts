import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  Message,
  JobUpdate,
  NodeUpdate,
  NodeProgress,
  OutputUpdate,
  ToolCallUpdate,
  Chunk,
  TaskUpdate,
  PlanningUpdate,
  Prediction,
  SubTaskResult,
  MessageList,
  Thread,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  LanguageModel
} from "./ApiTypes";
import { isLocalhost } from "./ApiClient";
import { CHAT_URL } from "./BASE_URL";
import { client } from "./ApiClient";
import log from "loglevel";
import { supabase } from "../lib/supabaseClient";
import { DEFAULT_MODEL } from "../config/constants";
import { NodeStore } from "../stores/NodeStore";
import {
  WebSocketManager,
  ConnectionState
} from "../lib/websocket/WebSocketManager";
import {
  FrontendToolRegistry,
  FrontendToolState
} from "../lib/tools/frontendTools";
import { uuidv4 } from "./uuidv4";
import {
  handleChatWebSocketMessage,
  MsgpackData,
  WorkflowCreatedUpdate,
  WorkflowUpdatedUpdate
} from "../core/chat/chatProtocol";

// Include additional runtime statuses used during message streaming
type ChatStatus =
  | ConnectionState
  | "loading"
  | "streaming"
  | "error"
  | "stopping";

export interface GlobalChatState {
  // Connection state
  status: ChatStatus;
  statusMessage: string | null;
  progress: { current: number; total: number };
  error: string | null;
  workflowId: string | null;

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
  messageCache: Record<string, Message[]>; // threadId -> messages
  messageCursors: Record<string, string | null>; // threadId -> next cursor
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

  // Workflow graph updates
  lastWorkflowGraphUpdate: WorkflowCreatedUpdate | WorkflowUpdatedUpdate | null;

  // Frontend tool state
  frontendToolState: FrontendToolState;
  setFrontendToolState: (state: FrontendToolState) => void;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;

  // Thread actions
  fetchThreads: () => Promise<void>;
  createNewThread: (title?: string) => Promise<string>;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  setLastUsedThreadId: (threadId: string | null) => void;
  getCurrentMessages: () => Message[];
  getCurrentMessagesSync: () => Message[];
  loadMessages: (threadId: string, cursor?: string) => Promise<Message[]>;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  summarizeThread: (
    threadId: string,
    provider: string,
    model: string,
    content: string
  ) => Promise<void>;
  stopGeneration: () => void;

  // Message cache management
  addMessageToCache: (threadId: string, message: Message) => void;
  clearMessageCache: (threadId: string) => void;

  // Agent execution message grouping
  getAgentExecutionMessages: (
    threadId: string,
    agentExecutionId: string
  ) => Message[];
}

function buildDefaultLanguageModel(): LanguageModel {
  return {
    type: "language_model",
    provider: "empty",
    id: DEFAULT_MODEL,
    name: DEFAULT_MODEL
  };
}

const useGlobalChatStore = create<GlobalChatState>()(
  persist<GlobalChatState>(
    (set, get) => ({
      // Connection state
      status: "disconnected",
      statusMessage: null,
      progress: { current: 0, total: 0 },
      error: null,
      workflowId: null,
      wsManager: null,
      socket: null,
      currentRunningToolCallId: null,
      currentToolMessage: null,

      // Thread state - ensure default values
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

      // Frontend tool state
      frontendToolState: {
        nodeMetadata: {},
        currentWorkflowId: null,
        getWorkflow: () => undefined,
        addWorkflow: () => {},
        removeWorkflow: () => {},
        getNodeStore: () => undefined,
        updateWorkflow: () => {},
        saveWorkflow: () => Promise.resolve(),
        getCurrentWorkflow: () => undefined,
        setCurrentWorkflowId: () => {},
        fetchWorkflow: () => Promise.resolve(),
        newWorkflow: () => {
          throw new Error("Not initialized");
        },
        createNew: () => Promise.reject(new Error("Not initialized")),
        searchTemplates: () => Promise.reject(new Error("Not initialized")),
        copy: () => Promise.reject(new Error("Not initialized"))
      },
      setFrontendToolState: (state: FrontendToolState) =>
        set({ frontendToolState: state }),
      // Task updates
      currentTaskUpdate: null,
      setTaskUpdate: (update: TaskUpdate | null) =>
        set({ currentTaskUpdate: update }),

      // Workflow graph updates
      lastWorkflowGraphUpdate: null,

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

        // Get authentication URL
        let wsUrl = CHAT_URL;
        if (!isLocalhost) {
          try {
            const {
              data: { session }
            } = await supabase.auth.getSession();
            if (session?.access_token) {
              wsUrl = `${CHAT_URL}?api_key=${session.access_token}`;
              log.debug("Adding authentication to WebSocket connection");
            } else {
              log.warn(
                "No Supabase session found, connecting without authentication"
              );
            }
          } catch (error) {
            log.error("Error getting Supabase session:", error);
            set({
              status: "failed",
              error: "Authentication failed. Please log in again."
            });
            throw error;
          }
        }

        // Create WebSocket manager
        const wsManager = new WebSocketManager({
          url: wsUrl,
          reconnect: true,
          reconnectInterval: 1000,
          reconnectDecay: 1.5,
          reconnectAttempts: 10,
          timeoutInterval: 30000,
          binaryType: "arraybuffer"
        });

        // Set up event handlers
        wsManager.on("stateChange", (newState: ConnectionState) => {
          // Don't override loading status when WebSocket connects
          const currentState = get();
          if (newState === "connected" && currentState.status === "loading") {
            // Keep loading status if we're waiting for a response
            set({
              error: null,
              statusMessage: null
            });
          } else {
            set({ status: newState });

            if (newState === "connected") {
              set({
                error: null,
                statusMessage: null
              });
            }
          }
        });

        wsManager.on("reconnecting", (attempt: number, maxAttempts: number) => {
          set({
            statusMessage: `Reconnecting... (attempt ${attempt}/${maxAttempts})`
          });
        });

        wsManager.on("message", (data: MsgpackData) => {
          handleChatWebSocketMessage(data, set, get);
        });

        wsManager.on("open", () => {
          set({ socket: wsManager.getWebSocket() });
          // Send client tools manifest after connection opens
          const manifest = FrontendToolRegistry.getManifest();
          if (manifest.length > 0) {
            wsManager.send({
              type: "client_tools_manifest",
              tools: manifest
            });
          }
        });

        wsManager.on("error", (error: Error) => {
          log.error("WebSocket error:", error);
          let errorMessage = error.message;

          if (!isLocalhost) {
            errorMessage += " This may be due to an authentication issue.";
          }

          set({
            error: errorMessage
          });
        });

        wsManager.on("close", (code: number, reason: string) => {
          set({ socket: null });
          if (code === 1008 || code === 4001 || code === 4003) {
            // Authentication errors
            set({
              error: "Authentication failed. Please log in again."
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
        const { wsManager, currentThreadId, workflowId, agentMode } = get();

        set({ error: null });

        console.log("sendMessage", message);

        if (!wsManager || !wsManager.isConnected()) {
          set({ error: "Not connected to chat service" });
          return;
        }

        // Ensure we have a thread
        let threadId = currentThreadId;
        if (!threadId) {
          threadId = await get().createNewThread();
        }

        // Prepare messages for cache and wire (workflow_id only on wire)
        const messageForCache: Message = {
          ...(message as any),
          thread_id: threadId,
          agent_mode: agentMode
        } as any;

        const messageToSend = {
          ...(message as any),
          workflow_id: workflowId ?? null,
          thread_id: threadId,
          agent_mode: agentMode
        } as any;

        console.log("sendMessage", messageToSend);

        // Check if this is the first user message BEFORE adding to cache
        const existingMessages = get().messageCache[threadId] || [];
        const userMessageCount = existingMessages.filter(
          (msg) => msg.role === "user"
        ).length;
        const isFirstUserMessage =
          message.role === "user" && userMessageCount === 0;
        // Add message to cache optimistically
        get().addMessageToCache(threadId, messageForCache);

        // Auto-generate title from first user message if not set
        if (isFirstUserMessage) {
          const state = get();
          const thread = state.threads[threadId];
          if (thread) {
            let contentText = "";
            if (typeof message.content === "string") {
              contentText = message.content as string;
            } else if (Array.isArray(message.content)) {
              const firstText = (message.content as any[]).find(
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

        set({ status: "loading" }); // Waiting for response

        try {
          wsManager.send(messageToSend);

          // Safety timeout - reset status if no response after 60 seconds
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
                currentTaskUpdate: null
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
          const { data, error } = await client.GET("/api/threads/");
          if (error) {
            throw new Error(
              error.detail?.[0]?.msg || "Failed to fetch threads"
            );
          }

          // Convert array to Record keyed by thread ID
          const threadsRecord: Record<string, Thread> = {};
          data.threads.forEach((thread) => {
            threadsRecord[thread.id] = thread;
          });

          set({ threads: threadsRecord, threadsLoaded: true });
        } catch (error) {
          log.error("Failed to fetch threads:", error);
          set({ threadsLoaded: true }); // Ensure threadsLoaded is true even on error
        } finally {
          set({ isLoadingThreads: false });
        }
      },

      createNewThread: async (title?: string) => {
        // Create thread locally; server will auto-create on first message
        const id = uuidv4();
        const now = new Date().toISOString();
        const localThread: Thread = {
          id,
          title: title || "New conversation",
          created_at: now as any,
          updated_at: now as any
        } as any;

        set((state) => ({
          threads: {
            ...state.threads,
            [id]: localThread
          },
          currentThreadId: id,
          lastUsedThreadId: id,
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
        set({ currentThreadId: threadId, lastUsedThreadId: threadId });
        get().loadMessages(threadId);
      },

      deleteThread: async (threadId: string) => {
        try {
          const { error } = await client.DELETE("/api/threads/{thread_id}", {
            params: { path: { thread_id: threadId } }
          });
          if (error) {
            throw new Error(
              error.detail?.[0]?.msg || "Failed to delete thread"
            );
          }

          // Update local state
          set((state) => {
            const { [threadId]: deleted, ...remainingThreads } = state.threads;

            // Clear message cache for deleted thread
            const { [threadId]: deletedCache, ...remainingCache } =
              state.messageCache;
            const { [threadId]: deletedCursor, ...remainingCursors } =
              state.messageCursors;

            const newState: Partial<GlobalChatState> = {
              threads: remainingThreads,
              messageCache: remainingCache,
              messageCursors: remainingCursors
            };

            // If deleting current thread, switch to another or create new
            if (state.currentThreadId === threadId) {
              const threadIds = Object.keys(remainingThreads);
              if (threadIds.length > 0) {
                const newCurrentThreadId = threadIds[threadIds.length - 1];
                newState.currentThreadId = newCurrentThreadId;
                newState.lastUsedThreadId = newCurrentThreadId;
                // Auto-load messages for the new current thread
                setTimeout(() => get().loadMessages(newCurrentThreadId), 0);
              } else {
                // No threads left, clear current thread (we will create a new one below)
                newState.currentThreadId = null;
                newState.lastUsedThreadId = null;
              }
            }
            // If the deleted thread was the last used, but not current, pick another if available
            else if (state.lastUsedThreadId === threadId) {
              const threadIds = Object.keys(remainingThreads);
              newState.lastUsedThreadId = threadIds.length
                ? threadIds[threadIds.length - 1]
                : null;
            }

            return newState as GlobalChatState;
          });

          // If no threads remain, create a new one immediately
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

      // Get current messages synchronously from cache
      getCurrentMessagesSync: () => {
        const { currentThreadId, messageCache } = get();
        if (!currentThreadId) {
          return [];
        }
        return messageCache[currentThreadId] || [];
      },

      loadMessages: async (threadId: string, cursor?: string) => {
        const { messageCache, messageCursors, isLoadingMessages } = get();

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
          const { data, error } = await client.GET("/api/messages/", {
            params: {
              query: {
                thread_id: threadId,
                cursor: cursor || undefined,
                limit: 100
              }
            }
          });
          console.log("loadMessages", data);

          if (error) {
            throw new Error(
              error.detail?.[0]?.msg || "Failed to load messages"
            );
          }

          const messages = data.messages || [];
          const nextCursor = data.next;

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
                [threadId]: nextCursor
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
          const request: ThreadUpdateRequest = { title };
          await client.PUT("/api/threads/{thread_id}", {
            params: { path: { thread_id: threadId } },
            body: request
          });
        } catch (error) {
          log.error("Failed to update thread title:", error);
          // Do not throw to keep optimistic UI
        }
      },

      summarizeThread: async (
        threadId: string,
        provider: string,
        model: string,
        content: string
      ) => {
        console.log("summarizeThread called:", { threadId, provider, model });
        const request: ThreadSummarizeRequest = {
          provider,
          model,
          content
        };
        try {
          const { data, error } = await client.POST(
            "/api/threads/{thread_id}/summarize",
            {
              params: { path: { thread_id: threadId } },
              body: request
            }
          );

          if (error) {
            console.error("Summarize API error:", error);
            throw new Error(
              error.detail?.[0]?.msg || "Failed to summarize thread"
            );
          }

          console.log("Thread summarized, new title:", data.title);

          // Update the thread in local state if title was changed
          set((state) => {
            const thread = state.threads[threadId];
            if (thread && data.title !== thread.title) {
              return {
                threads: {
                  ...state.threads,
                  [threadId]: {
                    ...thread,
                    title: data.title,
                    updated_at: data.updated_at
                  }
                }
              };
            }
            return state;
          });

          log.info(`Thread ${threadId} summarized successfully`);
        } catch (error) {
          log.error("Failed to summarize thread:", error);
          console.error("Failed to summarize thread:", error);
          // Don't throw error - summarization is not critical
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
          const { [threadId]: deleted, ...remainingCache } = state.messageCache;
          const { [threadId]: deletedCursor, ...remainingCursors } =
            state.messageCursors;

          return {
            messageCache: remainingCache,
            messageCursors: remainingCursors
          };
        });
      },

      stopGeneration: () => {
        const { wsManager, currentThreadId, status } = get();

        // Debug logging
        console.log("stopGeneration called:", {
          hasWsManager: !!wsManager,
          isConnected: wsManager?.isConnected(),
          currentThreadId,
          status
        });

        // Abort any active frontend tools
        FrontendToolRegistry.abortAll();

        if (!wsManager) {
          console.log("No WebSocket manager available");
          return;
        }

        if (!wsManager.isConnected()) {
          console.log("WebSocket is not connected");
          return;
        }

        if (!currentThreadId) {
          console.log("No current thread ID");
          return;
        }

        log.info("Sending stop signal to workflow");
        console.log("Sending stop signal with thread_id:", currentThreadId);

        try {
          wsManager.send({ type: "stop", thread_id: currentThreadId });

          // Immediately reset to connected state
          set({
            status: "connected",
            progress: { current: 0, total: 0 },
            statusMessage: null,
            currentPlanningUpdate: null,
            currentTaskUpdate: null
          });
        } catch (error) {
          log.error("Failed to send stop signal:", error);
          console.error("Failed to send stop signal:", error);
          set({
            error: "Failed to stop generation",
            status: "error",
            statusMessage: null
          });
        }
      },

      getAgentExecutionMessages: (
        threadId: string,
        agentExecutionId: string
      ) => {
        const messages = get().messageCache[threadId] || [];
        return messages.filter(
          (msg) =>
            msg.role === "agent_execution" &&
            msg.agent_execution_id === agentExecutionId
        );
      }
    }),
    {
      name: "global-chat-storage",
      // Persist minimal subset incl. selections; do not persist message cache
      partialize: (state): any => ({
        threads: state.threads || {},
        lastUsedThreadId: state.lastUsedThreadId,
        selectedModel: state.selectedModel,
        selectedTools: state.selectedTools,
        selectedCollections: state.selectedCollections
      }),
      onRehydrateStorage: () => (state) => {
        // State has been rehydrated from storage
        if (state) {
          // Ensure threads is always an object
          if (!state.threads) {
            state.threads = {};
          }
          // Initialize message cache as empty
          state.messageCache = {};
          state.messageCursors = {};
          state.isLoadingMessages = false;
          state.isLoadingThreads = false;

          // Load threads from API if not loaded yet
          if (!state.threadsLoaded) {
            // Use setTimeout to avoid calling during hydration
            setTimeout(() => {
              const store = useGlobalChatStore.getState();
              store.fetchThreads().catch((error) => {
                log.error(
                  "Failed to load threads during initialization:",
                  error
                );
              });
            }, 0);
          }
          // Ensure selection defaults are present
          if (!state.selectedTools) state.selectedTools = [];
          if (!state.selectedCollections) state.selectedCollections = [];
          if (!state.selectedModel)
            state.selectedModel = buildDefaultLanguageModel();
          if (typeof state.lastUsedThreadId === "undefined")
            state.lastUsedThreadId = null;
        }
      }
    }
  )
);

// Network status monitoring
if (typeof window !== "undefined") {
  // Listen for online/offline events
  window.addEventListener("online", () => {
    const state = useGlobalChatStore.getState();
    if (
      (state.status === "disconnected" || state.status === "failed") &&
      state.wsManager
    ) {
      log.info("Network came online, attempting to reconnect...");
      state.connect().catch((error) => {
        log.error("Failed to reconnect after network online:", error);
      });
    }
  });

  window.addEventListener("offline", () => {
    log.info("Network went offline");
    // The WebSocket will close automatically, triggering our reconnection logic
  });

  // Visibility change handling - reconnect when tab becomes visible
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const state = useGlobalChatStore.getState();
      if (
        (state.status === "disconnected" || state.status === "failed") &&
        state.wsManager
      ) {
        log.info("Tab became visible, checking connection...");
        state.connect().catch((error) => {
          log.error("Failed to reconnect after tab visible:", error);
        });
      }
    }
  });
}

// Custom hook for TanStack Query thread loading
export const useThreadsQuery = () => {
  const query = useQuery({
    queryKey: ["threads"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/threads/", {
        params: {
          query: {
            limit: 100
          }
        }
      });
      console.log("Threads fetched:", data);
      if (error) {
        throw new Error(error.detail?.[0]?.msg || "Failed to fetch threads");
      }
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Handle success and error states using useEffect
  React.useEffect(() => {
    if (query.isSuccess && query.data) {
      // Update the store with fetched threads
      console.log("Threads fetched:", query.data);
      const threadsRecord: Record<string, Thread> = {};
      query.data.threads.forEach((thread) => {
        threadsRecord[thread.id] = thread;
      });

      useGlobalChatStore.setState({
        threads: threadsRecord,
        threadsLoaded: true,
        isLoadingThreads: false
      });
    }
  }, [query.isSuccess, query.data]);

  React.useEffect(() => {
    if (query.isError) {
      // Update store with error state
      useGlobalChatStore.setState({
        threadsLoaded: true,
        isLoadingThreads: false
      });
      log.error("Failed to fetch threads:", query.error);
    }
  }, [query.isError, query.error]);

  return query;
};

export default useGlobalChatStore;
