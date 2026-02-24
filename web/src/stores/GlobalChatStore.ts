/**
 * Global chat state and WebSocket bridge.
 *
 * Server contract: connects to `CHAT_URL` (with Supabase auth outside
 * localhost) and exchanges chatProtocol messages: Message streams, Job/Node
 * updates, ToolCallUpdate, PlanningUpdate/TaskUpdate, and workflow graph
 * updates keyed by thread_id. The server is expected to preserve message
 * ordering per thread and resume streams after reconnects.
 *
 * State machine: disconnected → connecting → connected/streaming → stopping →
 * disconnected or error. Reconnects recreate the WebSocketManager, restore the
 * active thread, and replay cached messages while new ones stream in.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  Message,
  TaskUpdate,
  PlanningUpdate,
  LogUpdate,
  Thread,
  ThreadUpdateRequest,
  ThreadSummarizeRequest,
  LanguageModel
} from "./ApiTypes";
import { isLocalhost } from "./ApiClient";
import { client } from "./ApiClient";
import log from "loglevel";
import { DEFAULT_MODEL } from "../config/constants";
import { ConnectionState } from "../lib/websocket/WebSocketManager";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
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

export type StepToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown> | null;
  message?: string | null;
  startedAt: number;
};

export type AgentExecutionToolCalls = Record<
  string,
  Record<string, StepToolCall[]>
>;

export interface GlobalChatState {
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

  // WebSocket event subscriptions
  wsEventUnsubscribes: Array<() => void>;
  wsThreadSubscriptions: Record<string, () => void>;

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

  // Agent execution trace
  agentExecutionToolCalls: AgentExecutionToolCalls;

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
  lastTaskUpdatesByThread: Record<string, TaskUpdate | null>;

  // Log updates
  currentLogUpdate: LogUpdate | null;
  setLogUpdate: (update: LogUpdate | null) => void;

  // Workflow graph updates
  lastWorkflowGraphUpdate: WorkflowCreatedUpdate | WorkflowUpdatedUpdate | null;

  // Safety timeout tracking for sendMessage
  sendMessageTimeoutId: ReturnType<typeof setTimeout> | null;

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
  fetchThread: (threadId: string) => Promise<Thread | null>;
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
      threadWorkflowId: {},
      wsEventUnsubscribes: [],
      wsThreadSubscriptions: {},
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

      // Agent execution trace
      agentExecutionToolCalls: {},

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
      currentTaskUpdateThreadId: null,
      lastTaskUpdatesByThread: {},

      // Log updates
      currentLogUpdate: null,
      setLogUpdate: (update: LogUpdate | null) =>
        set({ currentLogUpdate: update }),

      // Workflow graph updates
      lastWorkflowGraphUpdate: null,

      // Safety timeout tracking for sendMessage
      sendMessageTimeoutId: null,

      connect: async () => {
        log.info("Connecting to global chat");

        const state = get();

        state.wsEventUnsubscribes.forEach((unsubscribe) => unsubscribe());
        Object.values(state.wsThreadSubscriptions).forEach((unsubscribe) =>
          unsubscribe()
        );

        // Load threads if not already loaded
        if (!state.threadsLoaded) {
          await get().fetchThreads();
        }

        // Ensure WebSocket connection is established first
        try {
          await globalWebSocketManager.ensureConnection();
        } catch (error) {
          log.error("Failed to establish WebSocket connection:", error);
          set({
            error: "Failed to connect to chat service",
            status: "failed"
          });
          throw error;
        }

        const eventUnsubscribes: Array<() => void> = [];

        // Set up event handlers on the shared connection
        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent(
            "stateChange",
            (newState: ConnectionState) => {
              // Don't override loading status when WebSocket connects
              const currentState = get();
              if (
                newState === "connected" &&
                currentState.status === "loading"
              ) {
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
            }
          )
        );

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent(
            "reconnecting",
            (attempt: number, maxAttempts: number) => {
              set({
                statusMessage: `Reconnecting... (attempt ${attempt}/${maxAttempts})`
              });
            }
          )
        );

        const threadSubscriptions: Record<string, () => void> = {};
        const stateThreads = Object.keys(get().threads);
        stateThreads.forEach((threadId) => {
          // Unsubscribe any handler that was registered between the
          // initial cleanup and this point (possible during the await)
          const existing = get().wsThreadSubscriptions[threadId];
          if (existing) {
            existing();
          }
          threadSubscriptions[threadId] = globalWebSocketManager.subscribe(
            threadId,
            (data: MsgpackData) => {
              handleChatWebSocketMessage(data, set, get);
            }
          );
        });

        const sendManifest = () => {
          const manifest = FrontendToolRegistry.getManifest();
          if (manifest.length > 0) {
            void globalWebSocketManager
              .send({
                type: "client_tools_manifest",
                tools: manifest
              })
              .catch((e) => log.error("Failed to send manifest:", e));
          }
        };

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent("open", sendManifest)
        );

        if (globalWebSocketManager.isConnectionOpen()) {
          sendManifest();
        }

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent("error", (error: Error) => {
            log.error("WebSocket error:", error);
            let errorMessage = error.message;

            if (!isLocalhost) {
              errorMessage += " This may be due to an authentication issue.";
            }

            set({
              error: errorMessage
            });
          })
        );

        eventUnsubscribes.push(
          globalWebSocketManager.subscribeEvent(
            "close",
            (code?: number, _reason?: string) => {
              if (code === 1008 || code === 4001 || code === 4003) {
                // Authentication errors
                set({
                  error: "Authentication failed. Please log in again."
                });
              }
            }
          )
        );

        // Store subscriptions
        set({
          error: null,
          wsEventUnsubscribes: eventUnsubscribes,
          wsThreadSubscriptions: threadSubscriptions
        });

        // Connection is automatic via globalWebSocketManager
        // Subscriptions will trigger connection if not already connected
        log.info("Global chat subscriptions set up");
      },

      disconnect: () => {
        const {
          wsEventUnsubscribes,
          wsThreadSubscriptions,
          sendMessageTimeoutId
        } = get();
        wsEventUnsubscribes.forEach((unsubscribe) => unsubscribe());
        Object.values(wsThreadSubscriptions).forEach((unsubscribe) =>
          unsubscribe()
        );

        // Clear any pending sendMessage timeout
        if (sendMessageTimeoutId !== null) {
          clearTimeout(sendMessageTimeoutId);
        }

        set({
          wsEventUnsubscribes: [],
          wsThreadSubscriptions: {},
          status: "disconnected",
          error: null,
          statusMessage: null,
          sendMessageTimeoutId: null
        });
      },

      sendMessage: async (message: Message) => {
        const {
          currentThreadId,
          workflowId,
          agentMode,
          selectedModel,
          selectedTools,
          selectedCollections,
          sendMessageTimeoutId
        } = get();

        // Clear any existing safety timeout
        if (sendMessageTimeoutId !== null) {
          clearTimeout(sendMessageTimeoutId);
          set({ sendMessageTimeoutId: null });
        }

        set({ error: null });

        // Ensure WebSocket connection is established before sending
        try {
          await globalWebSocketManager.ensureConnection();
        } catch (_connError) {
          set({ error: "Not connected to chat service" });
          return;
        }

        // Ensure we have a thread
        let threadId = currentThreadId;
        if (!threadId) {
          threadId = await get().createNewThread();
        }

        // Ensure we have a WS subscription for this thread before sending,
        // otherwise streamed chunks/messages will be routed with no handler.
        if (!get().wsThreadSubscriptions[threadId]) {
          const unsub = globalWebSocketManager.subscribe(
            threadId as string,
            (data: MsgpackData) => {
              handleChatWebSocketMessage(data, set, get);
            }
          );
          set((state) => {
            // Guard against a race: if another path registered a handler
            // between our check and this set(), clean ours up to avoid a leak.
            const existing = state.wsThreadSubscriptions[threadId as string];
            if (existing !== undefined) {
              unsub();
              return {};
            }
            return {
              wsThreadSubscriptions: {
                ...state.wsThreadSubscriptions,
                [threadId as string]: unsub
              }
            };
          });
        }

        set((state) => ({
          threadWorkflowId: {
            ...state.threadWorkflowId,
            [threadId as string]: workflowId ?? null
          }
        }));

        // Prepare messages for cache and wire (workflow_id only on wire)
        // Preserve workflow_id if already set by caller (e.g., WorkflowAssistantChat)
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
          tools:
            message.tools ??
            (selectedTools.length > 0 ? selectedTools : undefined),
          collections:
            message.collections ??
            (selectedCollections.length > 0 ? selectedCollections : undefined)
        };

        // Wrap in chat_message command structure as per unified WebSocket API
        const commandMessage = {
          command: "chat_message",
          data: chatMessageData
        };

        // Add message to cache optimistically
        get().addMessageToCache(threadId, messageForCache);

        set({ status: "loading" }); // Waiting for response

        try {
          await globalWebSocketManager.send(commandMessage);

          // Safety timeout - reset status if no response after 60 seconds
          const timeoutId = setTimeout(() => {
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
                currentTaskUpdateThreadId: null,
                sendMessageTimeoutId: null
              });
            }
          }, 60000);
          set({ sendMessageTimeoutId: timeoutId });
        } catch (error) {
          // Clear timeout on error
          const currentTimeoutId = get().sendMessageTimeoutId;
          if (currentTimeoutId !== null) {
            clearTimeout(currentTimeoutId);
            set({ sendMessageTimeoutId: null });
          }
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

          const threadsRecord: Record<string, Thread> = {};
          data?.threads?.forEach((thread) => {
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
          const { data, error } = await client.GET("/api/threads/{thread_id}", {
            params: { path: { thread_id: threadId } }
          });
          if (error) {
            throw new Error(error.detail?.[0]?.msg || "Failed to fetch thread");
          }

          set((state) => ({
            threads: {
              ...state.threads,
              [threadId]: data
            }
          }));

          return data;
        } catch (error: unknown) {
          const isNotFound =
            error &&
            typeof error === "object" &&
            "status" in error &&
            error.status === 404;
          if (!isNotFound) {
            log.error("Failed to fetch thread:", error);
          }
          return null;
        }
      },

      createNewThread: async (title?: string) => {
        const safeTitle = typeof title === "string" ? title : undefined;

        // Create thread locally; server will auto-create on first message
        const id = uuidv4();
        const now = new Date().toISOString();
        const localThread: Thread = {
          id,
          title: safeTitle || "New conversation",
          created_at: now,
          updated_at: now
        } as Thread;

        // Subscribe first, then atomically store the unsubscribe handle.
        // This avoids the closure being created inside set() where a stale
        // read of wsThreadSubscriptions could leak an old handler.
        const existingUnsub = get().wsThreadSubscriptions[id];
        if (existingUnsub) {
          existingUnsub();
        }
        const newUnsub = globalWebSocketManager.subscribe(
          id,
          (data: MsgpackData) => {
            handleChatWebSocketMessage(data, set, get);
          }
        );

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
          },
          wsThreadSubscriptions: {
            ...state.wsThreadSubscriptions,
            [id]: newUnsub
          }
        }));

        return id;
      },

      switchThread: (threadId: string) => {
        const exists = !!get().threads[threadId];
        if (!exists) {
          return;
        }

        if (!get().wsThreadSubscriptions[threadId]) {
          const unsub = globalWebSocketManager.subscribe(
            threadId,
            (data: MsgpackData) => {
              handleChatWebSocketMessage(data, set, get);
            }
          );
          set((state) => {
            const existing = state.wsThreadSubscriptions[threadId];
            if (existing !== undefined) {
              unsub();
              return {};
            }
            return {
              wsThreadSubscriptions: {
                ...state.wsThreadSubscriptions,
                [threadId]: unsub
              }
            };
          });
        }

        set((state) => ({
          currentThreadId: threadId,
          lastUsedThreadId: threadId,
          workflowId: state.threadWorkflowId[threadId] ?? state.workflowId
        }));
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
            const { [threadId]: threadUnsubscribe, ...remainingSubscriptions } =
              state.wsThreadSubscriptions;
            threadUnsubscribe?.();

            const newState: Partial<GlobalChatState> = {
              threads: remainingThreads,
              messageCache: remainingCache,
              messageCursors: remainingCursors,
              wsThreadSubscriptions: remainingSubscriptions
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
        const { messageCache, isLoadingMessages } = get();

        if (isLoadingMessages) {
          return messageCache[threadId] || [];
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
          // Don't throw error - summarization is not critical
        }
      },

      addMessageToCache: (threadId: string, message: Message) => {
        set((state) => {
          const existingMessages = state.messageCache[threadId] || [];
          // Add created_at timestamp if not already present
          const messageWithTimestamp = {
            ...message,
            created_at: message.created_at || new Date().toISOString()
          };
          return {
            messageCache: {
              ...state.messageCache,
              [threadId]: [...existingMessages, messageWithTimestamp]
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
        const { currentThreadId, sendMessageTimeoutId } = get();

        // Clear any pending sendMessage timeout
        if (sendMessageTimeoutId !== null) {
          clearTimeout(sendMessageTimeoutId);
        }

        // Abort any active frontend tools
        FrontendToolRegistry.abortAll();

        if (!globalWebSocketManager) {
          set({ sendMessageTimeoutId: null });
          return;
        }

        if (!globalWebSocketManager.isConnectionOpen()) {
          set({ sendMessageTimeoutId: null });
          return;
        }

        if (!currentThreadId) {
          set({ sendMessageTimeoutId: null });
          return;
        }

        log.info("Sending stop signal to workflow");

        try {
          // Use command wrapper as per unified WebSocket API
          void globalWebSocketManager
            .send({
              command: "stop",
              data: { thread_id: currentThreadId }
            })
            .catch((error) => {
              log.error("Failed to send stop signal:", error);
            });

          set({
            status: "connected",
            progress: { current: 0, total: 0 },
            statusMessage: null,
            currentPlanningUpdate: null,
            currentTaskUpdate: null,
            currentTaskUpdateThreadId: null,
            sendMessageTimeoutId: null
          });
        } catch (error) {
          log.error("Failed to send stop signal:", error);
          console.error("Failed to send stop signal:", error);
          set({
            error: "Failed to stop generation",
            status: "error",
            statusMessage: null,
            sendMessageTimeoutId: null
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
      // Note: Return type cast needed due to zustand persist middleware type limitations
      partialize: (state) => ({
        threads: state.threads || {},
        lastUsedThreadId: state.lastUsedThreadId,
        selectedModel: state.selectedModel,
        selectedTools: state.selectedTools,
        selectedCollections: state.selectedCollections
      }) as any,
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
          if (!state.selectedTools) {
            state.selectedTools = [];
          }
          if (!state.selectedCollections) {
            state.selectedCollections = [];
          }
          if (!state.selectedModel) {
            state.selectedModel = buildDefaultLanguageModel();
          }
          if (typeof state.lastUsedThreadId === "undefined") {
            state.lastUsedThreadId = null;
          }
        }
      }
    }
  )
);

// Network status monitoring
const registerGlobalChatListeners = () => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = () => {
    const state = useGlobalChatStore.getState();
    if (state.status === "disconnected" || state.status === "failed") {
      log.info(
        "Network came online, connection will be established automatically"
      );
      // globalWebSocketManager handles reconnection automatically
    }
  };

  const handleOffline = () => {
    log.info("Network went offline");
    // The WebSocket will close automatically, triggering our reconnection logic
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      const state = useGlobalChatStore.getState();
      if (state.status === "disconnected" || state.status === "failed") {
        log.info(
          "Tab became visible, connection will be established automatically"
        );
        // globalWebSocketManager handles reconnection automatically
      }
    }
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
};

let teardownGlobalChatListeners: (() => void) | null = null;

if (typeof window !== "undefined") {
  teardownGlobalChatListeners = registerGlobalChatListeners();
}

export const removeGlobalChatListeners = () => {
  teardownGlobalChatListeners?.();
  teardownGlobalChatListeners = null;
};

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
      if (error) {
        throw new Error(error.detail?.[0]?.msg || "Failed to fetch threads");
      }
      log.debug("Threads fetched:", data);
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Handle success and error states using useEffect
  React.useEffect(() => {
    if (query.isSuccess && query.data) {
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
