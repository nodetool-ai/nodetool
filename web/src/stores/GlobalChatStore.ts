import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  Message,
  MessageContent,
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
  ThreadCreateRequest,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  ThreadList
} from "./ApiTypes";
import { CHAT_URL, isLocalhost } from "./ApiClient";
import { client } from "./ApiClient";
import log from "loglevel";
import { supabase } from "../lib/supabaseClient";
import { uuidv4 } from "./uuidv4";
import {
  WebSocketManager,
  ConnectionState
} from "../lib/websocket/WebSocketManager";

// Include additional runtime statuses used during message streaming
type ChatStatus =
  | ConnectionState
  | "loading"
  | "streaming"
  | "error"
  | "stopping";

interface GlobalChatState {
  // Connection state
  status: ChatStatus;
  statusMessage: string | null;
  progress: { current: number; total: number };
  error: string | null;
  workflowId: string | null;

  // WebSocket manager
  wsManager: WebSocketManager | null;
  socket: WebSocket | null;

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;
  isLoadingThreads: boolean;
  threadsLoaded: boolean;

  // Message caching
  messageCache: Record<string, Message[]>; // threadId -> messages
  messageCursors: Record<string, string | null>; // threadId -> next cursor
  isLoadingMessages: boolean;

  // Agent mode
  agentMode: boolean;
  setAgentMode: (enabled: boolean) => void;

  // Planning updates
  currentPlanningUpdate: PlanningUpdate | null;
  setPlanningUpdate: (update: PlanningUpdate | null) => void;

  // Task updates
  currentTaskUpdate: TaskUpdate | null;
  setTaskUpdate: (update: TaskUpdate | null) => void;

  // Workflow graph updates
  lastWorkflowGraphUpdate: WorkflowCreatedUpdate | WorkflowUpdatedUpdate | null;

  // Actions
  connect: (workflowId?: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;

  // Thread actions
  fetchThreads: () => Promise<void>;
  createNewThread: (title?: string) => Promise<string>;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  getCurrentMessages: () => Promise<Message[]>;
  getCurrentMessagesSync: () => Message[];
  loadMessages: (threadId: string, cursor?: string) => Promise<Message[]>;
  updateThreadTitle: (threadId: string, title: string) => Promise<void>;
  summarizeThread: (
    threadId: string,
    provider: string,
    model: string
  ) => Promise<void>;
  stopGeneration: () => void;

  // Message cache management
  addMessageToCache: (threadId: string, message: Message) => void;
  clearMessageCache: (threadId: string) => void;
}

export type MsgpackData =
  | JobUpdate
  | Chunk
  | Prediction
  | NodeProgress
  | NodeUpdate
  | Message
  | ToolCallUpdate
  | TaskUpdate
  | PlanningUpdate
  | OutputUpdate
  | SubTaskResult
  | WorkflowCreatedUpdate
  | GenerationStoppedUpdate;

// Define the WorkflowCreatedUpdate type
interface WorkflowCreatedUpdate {
  type: "workflow_created";
  workflow_id: string;
  graph: any;
}

interface WorkflowUpdatedUpdate {
  type: "workflow_updated";
  workflow_id: string;
  graph: any;
}

interface GenerationStoppedUpdate {
  type: "generation_stopped";
  message: string;
}

const makeMessageContent = (type: string, data: Uint8Array): MessageContent => {
  const dataUri = URL.createObjectURL(new Blob([data]));
  if (type === "image") {
    return {
      type: "image_url",
      image: { type: "image", uri: dataUri }
    } as MessageContent;
  } else if (type === "audio") {
    return {
      type: "audio",
      audio: { type: "audio", uri: dataUri }
    } as MessageContent;
  } else if (type === "video") {
    return {
      type: "video",
      video: { type: "video", uri: dataUri }
    } as MessageContent;
  }
  throw new Error(`Unknown message content type: ${type}`);
};

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

      // Thread state - ensure default values
      threads: {} as Record<string, Thread>,
      currentThreadId: null as string | null,
      isLoadingThreads: false,
      threadsLoaded: false,

      // Message cache
      messageCache: {},
      messageCursors: {},
      isLoadingMessages: false,

      // Agent mode
      agentMode: false,
      setAgentMode: (enabled: boolean) => set({ agentMode: enabled }),

      // Planning updates
      currentPlanningUpdate: null,
      setPlanningUpdate: (update: PlanningUpdate | null) =>
        set({ currentPlanningUpdate: update }),

      // Task updates
      currentTaskUpdate: null,
      setTaskUpdate: (update: TaskUpdate | null) =>
        set({ currentTaskUpdate: update }),

      // Workflow graph updates
      lastWorkflowGraphUpdate: null,

      connect: async (workflowId?: string) => {
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
          handleWebSocketMessage(data, set, get);
        });

        wsManager.on("open", () => {
          set({ socket: wsManager.getWebSocket() });
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
          workflowId: workflowId || null,
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

        if (!wsManager || !wsManager.isConnected()) {
          set({ error: "Not connected to chat service" });
          return;
        }

        // Ensure we have a thread
        let threadId = currentThreadId;
        if (!threadId) {
          threadId = await get().createNewThread();
        }

        // Prepare message
        const messageToSend = {
          ...message,
          workflow_id: workflowId || undefined,
          thread_id: threadId,
          agent_mode: agentMode
        };

        // Check if this is the first user message BEFORE adding to cache
        const thread = get().threads[threadId];
        const existingMessages = get().messageCache[threadId] || [];
        const userMessageCount = existingMessages.filter(
          (msg) => msg.role === "user"
        ).length;
        const isFirstUserMessage =
          message.role === "user" && userMessageCount === 0;

        console.log("Summarization check:", {
          threadId,
          messageRole: message.role,
          userMessageCount,
          isFirstUserMessage,
          hasProvider: !!message.provider,
          hasModel: !!message.model,
          hasThread: !!thread,
          provider: message.provider,
          model: message.model
        });

        // Add message to cache optimistically
        get().addMessageToCache(threadId, messageToSend);

        if (isFirstUserMessage && message.provider && message.model && thread) {
          console.log("Triggering thread summarization for thread:", threadId);
          // Call summarize in parallel - don't wait for it
          get()
            .summarizeThread(threadId, message.provider, message.model)
            .catch((error) => {
              log.error("Failed to summarize thread:", error);
            });
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
          get().clearMessageCache(threadId);
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
        const request: ThreadCreateRequest = {
          title: title || "New Conversation"
        };

        try {
          const { data, error } = await client.POST("/api/threads/", {
            body: request
          });
          if (error) {
            throw new Error(
              error.detail?.[0]?.msg || "Failed to create thread"
            );
          }

          // Add to local state
          set((state) => ({
            threads: {
              ...state.threads,
              [data.id]: data
            },
            currentThreadId: data.id
          }));

          // Initialize empty message cache for new thread
          set((state) => ({
            messageCache: {
              ...state.messageCache,
              [data.id]: []
            }
          }));

          return data.id;
        } catch (error) {
          log.error("Failed to create new thread:", error);
          throw error;
        }
      },

      switchThread: (threadId: string) => {
        const { threads } = get();
        if (!threads[threadId]) {
          log.warn(`Thread ${threadId} not found in store, not switching.`);
          return;
        }
        set({ currentThreadId: threadId });
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
                // Auto-load messages for the new current thread
                setTimeout(() => get().loadMessages(newCurrentThreadId), 0);
              } else {
                // No threads left, clear current thread (new one will be created as needed)
                newState.currentThreadId = null;
              }
            }

            return newState as GlobalChatState;
          });
        } catch (error) {
          log.error("Failed to delete thread:", error);
          throw error;
        }
      },

      getCurrentMessages: async () => {
        const { currentThreadId } = get();
        if (!currentThreadId) {
          return [];
        }

        return await get().loadMessages(currentThreadId);
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
        const request: ThreadUpdateRequest = { title };
        try {
          const { data, error } = await client.PUT("/api/threads/{thread_id}", {
            params: { path: { thread_id: threadId } },
            body: request
          });
          if (error) {
            throw new Error(
              error.detail?.[0]?.msg || "Failed to update thread title"
            );
          }

          set((state) => {
            const thread = state.threads[threadId];
            if (thread) {
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
        } catch (error) {
          log.error("Failed to update thread title:", error);
          throw error;
        }
      },

      summarizeThread: async (
        threadId: string,
        provider: string,
        model: string
      ) => {
        console.log("summarizeThread called:", { threadId, provider, model });
        const request: ThreadSummarizeRequest = { provider, model };
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

          // Immediately update UI to show stopping state
          set({
            status: "stopping",
            progress: { current: 0, total: 0 },
            statusMessage: "Stopping generation...",
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
      }
    }),
    {
      name: "global-chat-storage",
      // Only persist threads and currentThreadId - not message cache
      partialize: (state): any => ({
        threads: state.threads || {}
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
        }
      }
    }
  )
);

// WebSocket message handler
function handleWebSocketMessage(
  data: MsgpackData,
  set: (
    state:
      | Partial<GlobalChatState>
      | ((state: GlobalChatState) => Partial<GlobalChatState>)
  ) => void,
  get: () => GlobalChatState
) {
  const currentState = get();

  // When in stopping state, ignore most message types until we get stop confirmation
  if (currentState.status === "stopping") {
    // Only process generation_stopped, error, and job_update messages when stopping
    if (!["generation_stopped", "error", "job_update"].includes(data.type)) {
      return;
    }
  }

  if (data.type === "message") {
    const message = data as Message;
    const threadId = get().currentThreadId;
    if (threadId) {
      const messages = get().messageCache[threadId] || [];
      set((state) => {
        const thread = state.threads[threadId];
        if (thread) {
          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, message]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            },
            status: "connected",
            progress: { current: 0, total: 0 },
            statusMessage: null
          };
        }
        return state;
      });
    }
  } else if (data.type === "job_update") {
    const update = data as JobUpdate;
    if (update.status === "completed") {
      set({
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      });
    } else if (update.status === "failed") {
      set({
        status: "error",
        error: update.error,
        progress: { current: 0, total: 0 },
        statusMessage: update.error || null
      });
    }
  } else if (data.type === "node_update") {
    const update = data as NodeUpdate;
    if (update.status === "completed") {
      set({
        status: "connected",
        progress: { current: 0, total: 0 },
        statusMessage: null
      });
    } else {
      set({ statusMessage: update.node_name });
    }
  } else if (data.type === "chunk") {
    const chunk = data as Chunk;
    const threadId = get().currentThreadId;
    if (threadId) {
      const thread = get().threads[threadId];
      if (thread) {
        const messages = get().messageCache[threadId] || [];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          // Append to the last assistant message
          const updatedMessage: Message = {
            ...lastMessage,
            content: (lastMessage.content || "") + chunk.content
          };
          set((state) => ({
            status: "streaming",
            statusMessage: null,
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages.slice(0, -1), updatedMessage]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            }
          }));
        } else {
          // Create a new assistant message
          const message: Message = {
            role: "assistant" as const,
            type: "message" as const,
            content: chunk.content,
            workflow_id: get().workflowId
          };
          set((state) => ({
            status: "streaming",
            statusMessage: null,
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, message]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            }
          }));
        }
        if (chunk.done) {
          set({
            status: "connected",
            statusMessage: null,
            currentPlanningUpdate: null,
            currentTaskUpdate: null
          });
        }
      }
    }
  } else if (data.type === "output_update") {
    const update = data as OutputUpdate;
    const threadId = get().currentThreadId;
    if (threadId) {
      const thread = get().threads[threadId];
      if (thread) {
        if (update.output_type === "string") {
          const messages = get().messageCache[threadId] || [];
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            // Check if this is the end of stream marker
            if (update.value === "<nodetool_end_of_stream>") {
              return;
            }
            // Append to the last assistant message
            const updatedMessage: Message = {
              ...lastMessage,
              content: lastMessage.content + (update.value as string)
            };
            set((state) => ({
              status: "streaming",
              statusMessage: undefined,
              messageCache: {
                ...state.messageCache,
                [threadId]: [...messages.slice(0, -1), updatedMessage]
              },
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  updated_at: new Date().toISOString()
                }
              }
            }));
          } else {
            // Create a new assistant message
            const message: Message = {
              role: "assistant" as const,
              type: "message" as const,
              content: update.value as string,
              workflow_id: get().workflowId
            };
            set((state) => ({
              status: "streaming",
              messageCache: {
                ...state.messageCache,
                [threadId]: [...messages, message]
              },
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  updated_at: new Date().toISOString()
                }
              }
            }));
          }
        } else if (["image", "audio", "video"].includes(update.output_type)) {
          const message: Message = {
            role: "assistant",
            type: "message",
            content: [
              makeMessageContent(
                update.output_type,
                (update.value as { data: Uint8Array }).data
              )
            ],
            workflow_id: get().workflowId,
            name: "assistant"
          } as Message;
          const messages = get().messageCache[threadId] || [];
          set((state) => ({
            statusMessage: null,
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, message]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            }
          }));
        }
      }
    }
  } else if (data.type === "tool_call_update") {
    const update = data as ToolCallUpdate;
    set({ statusMessage: update.message });
  } else if (data.type === "node_progress") {
    const progress = data as NodeProgress;
    set({
      status: "loading",
      progress: { current: progress.progress, total: progress.total },
      statusMessage: null
    });
  } else if (data.type === "planning_update") {
    const update = data as PlanningUpdate;
    set({ currentPlanningUpdate: update });
  } else if (data.type === "task_update") {
    const update = data as TaskUpdate;
    set({ currentTaskUpdate: update });
  } else if (data.type === "subtask_result") {
    const update = data as SubTaskResult;
    // TODO: update the thread with the subtask result
  } else if (data.type === "workflow_updated") {
    const update = data as WorkflowUpdatedUpdate;
    const threadId = get().currentThreadId;

    // Store the workflow graph update
    set({ lastWorkflowGraphUpdate: update });

    if (threadId) {
      // Add a message to the thread about the created workflow
      const message: Message = {
        role: "assistant",
        type: "message",
        content: "Workflow updated successfully!",
        workflow_id: get().workflowId,
        graph: update.graph
      };
      const messages = get().messageCache[threadId] || [];
      set((state) => {
        const thread = state.threads[threadId];
        if (thread) {
          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, message]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            },
            status: "connected",
            statusMessage: null
          };
        }
        return state;
      });
    }
  } else if (data.type === "workflow_created") {
    const update = data as WorkflowCreatedUpdate;
    const threadId = get().currentThreadId;

    // Store the workflow graph update
    set({ lastWorkflowGraphUpdate: update });

    if (threadId) {
      // Add a message to the thread about the created workflow
      const message: Message = {
        role: "assistant",
        type: "message",
        content: "Workflow created successfully!",
        workflow_id: get().workflowId,
        graph: update.graph
      };

      const messages = get().messageCache[threadId] || [];
      set((state) => {
        const thread = state.threads[threadId];
        if (thread) {
          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...messages, message]
            },
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                updated_at: new Date().toISOString()
              }
            },
            status: "connected",
            statusMessage: null
          };
        }
        return state;
      });
    }
  } else if (data.type === "generation_stopped") {
    // Handle generation stopped response
    const stoppedData = data as GenerationStoppedUpdate;
    set({
      status: "connected",
      progress: { current: 0, total: 0 },
      statusMessage: null,
      currentPlanningUpdate: null,
      currentTaskUpdate: null
    });
    log.info("Generation stopped:", stoppedData.message);
  } else if (data.type === "error") {
    // Handle error messages
    const errorData = data as any;
    set({
      error: errorData.message || "An error occurred",
      status: "error",
      statusMessage: errorData.message
    });
  }
}

// Network status monitoring
if (typeof window !== "undefined") {
  // Listen for online/offline events
  window.addEventListener("online", () => {
    const state = useGlobalChatStore.getState();
    if (state.status === "disconnected" && state.wsManager) {
      log.info("Network came online, attempting to reconnect...");
      state.connect(state.workflowId || undefined).catch((error) => {
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
      if (state.status === "disconnected" && state.wsManager) {
        log.info("Tab became visible, checking connection...");
        state.connect(state.workflowId || undefined).catch((error) => {
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
