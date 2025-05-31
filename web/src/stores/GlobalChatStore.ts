import { create } from "zustand";
import { persist } from "zustand/middleware";
import { encode, decode } from "@msgpack/msgpack";
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
  Prediction
} from "./ApiTypes";
import { CHAT_URL, isLocalhost } from "./ApiClient";
import log from "loglevel";
import { supabase } from "../lib/supabaseClient";
import { uuidv4 } from "./uuidv4";

type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "streaming"
  | "error"
  | "reconnecting";

interface Thread {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

interface GlobalChatState {
  // Connection state
  status: ChatStatus;
  statusMessage: string | null;
  progress: { current: number; total: number };
  error: string | null;
  workflowId: string | null;
  socket: WebSocket | null;

  // Reconnection state
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  isIntentionalDisconnect: boolean;
  reconnectTimeoutId: NodeJS.Timeout | null;
  messageQueue: Message[];

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;

  // Actions
  connect: (workflowId?: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;

  // Thread actions
  createNewThread: () => string;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  getCurrentMessages: () => Message[];
  updateThreadTitle: (threadId: string, title: string) => void;
  stopGeneration: () => void;
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
  | OutputUpdate;

// Reconnection constants
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BACKOFF_FACTOR = 1.5; // Less aggressive than doubling

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
      socket: null,

      // Reconnection state
      reconnectAttempts: 0,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: INITIAL_RECONNECT_DELAY,
      isIntentionalDisconnect: false,
      reconnectTimeoutId: null,
      messageQueue: [],

      // Thread state - ensure default values
      threads: {} as Record<string, Thread>,
      currentThreadId: null as string | null,

      connect: async (workflowId?: string) => {
        log.info("Connecting to global chat");

        // Clear any pending reconnection
        const { reconnectTimeoutId } = get();
        if (reconnectTimeoutId) {
          clearTimeout(reconnectTimeoutId);
          set({ reconnectTimeoutId: null });
        }

        const existingSocket = get().socket;
        if (existingSocket) {
          if (
            existingSocket.readyState === WebSocket.OPEN ||
            existingSocket.readyState === WebSocket.CONNECTING
          ) {
            existingSocket.close();
          }
          set({ socket: null });
        }

        // Reset reconnection state on manual connect
        const isReconnecting = get().status === "reconnecting";
        
        set({
          workflowId: workflowId || null,
          status: isReconnecting ? "reconnecting" : "connecting",
          error: null,
          isIntentionalDisconnect: false,
          // Don't reset attempts if reconnecting
          ...(isReconnecting ? {} : {
            reconnectAttempts: 0,
            reconnectDelay: INITIAL_RECONNECT_DELAY
          })
        });

        // Get authentication token if not connecting to localhost
        let wsUrl = CHAT_URL;

        if (!isLocalhost) {
          try {
            const {
              data: { session }
            } = await supabase.auth.getSession();
            if (session?.access_token) {
              // Add token as query parameter for WebSocket connection
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
              status: "error",
              error: "Authentication failed. Please log in again."
            });
            return;
          }
        }

        log.info("Attempting to connect to WebSocket:", wsUrl);
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          log.info("Global Chat WebSocket connected");
          const state = get();
          
          // Reset reconnection state on successful connection
          set({ 
            socket, 
            status: "connected", 
            error: null,
            reconnectAttempts: 0,
            reconnectDelay: INITIAL_RECONNECT_DELAY
          });

          // Process any queued messages
          if (state.messageQueue.length > 0) {
            log.info(`Processing ${state.messageQueue.length} queued messages`);
            const queue = [...state.messageQueue];
            set({ messageQueue: [] });
            
            // Send queued messages
            queue.forEach(message => {
              get().sendMessage(message).catch(error => {
                log.error("Failed to send queued message:", error);
              });
            });
          }
        };

        socket.onmessage = async (event: MessageEvent) => {
          const arrayBuffer = await event.data.arrayBuffer();
          const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;

          console.log("data", data);

          if (data.type === "message") {
            const message = data as Message;
            const threadId = get().currentThreadId;
            if (threadId) {
              set((state) => {
                const thread = state.threads[threadId];
                if (thread) {
                  return {
                    threads: {
                      ...state.threads,
                      [threadId]: {
                        ...thread,
                        messages: [...thread.messages, message],
                        updatedAt: new Date().toISOString()
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
                progress: { current: 0, total: 0 },
                status: "connected",
                statusMessage: null
              });
            } else if (update.status === "failed") {
              set({
                error: update.error,
                status: "error",
                progress: { current: 0, total: 0 },
                statusMessage: update.error || null
              });
            }
          } else if (data.type === "node_update") {
            const update = data as NodeUpdate;
            if (update.status === "completed") {
              set({ progress: { current: 0, total: 0 }, statusMessage: null });
            } else {
              set({ statusMessage: update.node_name });
            }
          } else if (data.type === "chunk") {
            const chunk = data as Chunk;
            const threadId = get().currentThreadId;
            if (threadId) {
              const thread = get().threads[threadId];
              if (thread) {
                const messages = thread.messages;
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.role === "assistant") {
                  // Append to the last assistant message
                  const updatedMessage: Message = {
                    ...lastMessage,
                    content: (lastMessage.content || "") + chunk.content
                  };
                  set((state) => ({
                    status: "streaming",
                    statusMessage: undefined,
                    threads: {
                      ...state.threads,
                      [threadId]: {
                        ...thread,
                        messages: [...messages.slice(0, -1), updatedMessage],
                        updatedAt: new Date().toISOString()
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
                    statusMessage: undefined,
                    threads: {
                      ...state.threads,
                      [threadId]: {
                        ...thread,
                        messages: [...messages, message],
                        updatedAt: new Date().toISOString()
                      }
                    }
                  }));
                }
                if (chunk.done) {
                  set({ status: "connected", statusMessage: undefined });
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
                  const messages = thread.messages;
                  const lastMessage = messages[messages.length - 1];
                  if (lastMessage && lastMessage.role === "assistant") {
                    // Check if this is the end of stream marker
                    if (update.value === "<nodetool_end_of_stream>") {
                      set({ status: "connected" });
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
                      threads: {
                        ...state.threads,
                        [threadId]: {
                          ...thread,
                          messages: [...messages.slice(0, -1), updatedMessage],
                          updatedAt: new Date().toISOString()
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
                      threads: {
                        ...state.threads,
                        [threadId]: {
                          ...thread,
                          messages: [...messages, message],
                          updatedAt: new Date().toISOString()
                        }
                      }
                    }));
                  }
                } else if (
                  ["image", "audio", "video"].includes(update.output_type)
                ) {
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
                  set((state) => ({
                    status: "streaming",
                    statusMessage: undefined,
                    threads: {
                      ...state.threads,
                      [threadId]: {
                        ...thread,
                        messages: [...thread.messages, message],
                        updatedAt: new Date().toISOString()
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
          }
        };

        socket.onerror = (error) => {
          log.error("Global Chat WebSocket error:", error);
          // Only set error state if we're not already closing
          if (get().socket?.readyState !== WebSocket.CLOSING) {
            set({
              status: "error",
              error:
                "Connection failed." +
                (!isLocalhost
                  ? " This may be due to an authentication issue."
                  : "")
            });
          }
        };

        socket.onclose = (event) => {
          log.info("Global Chat WebSocket disconnected", {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });

          const state = get();
          
          // Check if this was an intentional disconnect
          if (state.isIntentionalDisconnect) {
            set({
              socket: null,
              status: "disconnected",
              error: null
            });
            return;
          }

          // Check if we should attempt reconnection
          const shouldReconnect = 
            !event.wasClean && 
            state.reconnectAttempts < state.maxReconnectAttempts &&
            // Don't reconnect on authentication errors
            event.code !== 1008 && // Policy violation
            event.code !== 4001 && // Unauthorized
            event.code !== 4003;   // Forbidden

          if (shouldReconnect) {
            // Calculate next delay with exponential backoff
            const nextDelay = Math.min(
              state.reconnectDelay * RECONNECT_BACKOFF_FACTOR,
              MAX_RECONNECT_DELAY
            );

            set({
              socket: null,
              status: "reconnecting",
              reconnectAttempts: state.reconnectAttempts + 1,
              reconnectDelay: nextDelay,
              statusMessage: `Reconnecting... (attempt ${state.reconnectAttempts + 1}/${state.maxReconnectAttempts})`,
              error: null
            });

            log.info(`Scheduling reconnection attempt ${state.reconnectAttempts + 1} in ${nextDelay}ms`);

            const timeoutId = setTimeout(() => {
              // Check if we're still supposed to reconnect
              if (!get().isIntentionalDisconnect) {
                get().connect(state.workflowId || undefined).catch(error => {
                  log.error("Reconnection attempt failed:", error);
                });
              }
            }, nextDelay);

            set({ reconnectTimeoutId: timeoutId });
          } else {
            // Max attempts reached or permanent error
            set({
              socket: null,
              status: "disconnected",
              error: event.reason || "Connection closed unexpectedly",
              statusMessage: null
            });
          }
        };

        set({ socket });

        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            clearInterval(interval);
            reject(new Error("Connection timeout"));
          }, 10000); // 10 second timeout

          const interval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              clearInterval(interval);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        });
      },

      disconnect: () => {
        const { socket, reconnectTimeoutId } = get();
        
        // Mark as intentional disconnect
        set({ isIntentionalDisconnect: true });
        
        // Clear any pending reconnection
        if (reconnectTimeoutId) {
          clearTimeout(reconnectTimeoutId);
          set({ reconnectTimeoutId: null });
        }
        
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
        
        set({ 
          socket: null, 
          status: "disconnected",
          error: null,
          statusMessage: null,
          reconnectAttempts: 0,
          reconnectDelay: INITIAL_RECONNECT_DELAY
        });
      },

      sendMessage: async (message: Message) => {
        const { socket, currentThreadId, status } = get();

        set({ error: null });

        // Handle offline/disconnected state
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          if (status === "reconnecting") {
            // Queue message for later delivery
            log.info("Queueing message while reconnecting");
            set(state => ({
              messageQueue: [...state.messageQueue, message]
            }));
            return;
          } else {
            // Try to reconnect if disconnected
            log.warn("Cannot send message: not connected");
            set({ error: "Not connected to chat service" });
            return;
          }
        }

        // Ensure we have a thread
        let threadId = currentThreadId;
        if (!threadId) {
          threadId = get().createNewThread();
        }

        message.workflow_id = get().workflowId || undefined;
        message.thread_id = threadId;

        // Add message to thread
        const thread = get().threads[threadId];
        if (thread) {
          // Auto-generate title from first user message if not set
          let title = thread.title;
          if (
            !title &&
            thread.messages.length === 0 &&
            message.role === "user"
          ) {
            const content =
              typeof message.content === "string"
                ? message.content
                : Array.isArray(message.content) &&
                  message.content[0]?.type === "text"
                ? (message.content[0] as any).text
                : "New conversation";
            title =
              content.substring(0, 50) + (content.length > 50 ? "..." : "");
          }

          set((state) => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                messages: [...thread.messages, message],
                updatedAt: new Date().toISOString(),
                ...(title && !thread.title ? { title } : {})
              }
            },
            status: "loading"
          }));
        }

        socket?.send(encode(message));
      },

      resetMessages: () => {
        const threadId = get().currentThreadId;
        if (threadId) {
          set((state) => ({
            threads: {
              ...state.threads,
              [threadId]: {
                ...state.threads[threadId],
                messages: [],
                updatedAt: new Date().toISOString()
              }
            }
          }));
        }
      },

      createNewThread: () => {
        const threadId = uuidv4();
        const now = new Date().toISOString();
        set((state) => ({
          threads: {
            ...state.threads,
            [threadId]: {
              id: threadId,
              messages: [],
              createdAt: now,
              updatedAt: now
            }
          },
          currentThreadId: threadId
        }));
        return threadId;
      },

      switchThread: (threadId: string) => {
        const thread = get().threads[threadId];
        if (thread) {
          set({ currentThreadId: threadId });
        }
      },

      deleteThread: (threadId: string) => {
        set((state) => {
          const { [threadId]: deleted, ...remainingThreads } = state.threads;
          const newState: Partial<GlobalChatState> = {
            threads: remainingThreads
          };

          // If deleting current thread, switch to another or create new
          if (state.currentThreadId === threadId) {
            const threadIds = Object.keys(remainingThreads);
            if (threadIds.length > 0) {
              newState.currentThreadId = threadIds[threadIds.length - 1];
            } else {
              // No threads left, create a new one
              const newThreadId = uuidv4();
              const now = new Date().toISOString();
              newState.threads = {
                [newThreadId]: {
                  id: newThreadId,
                  messages: [],
                  createdAt: now,
                  updatedAt: now
                }
              };
              newState.currentThreadId = newThreadId;
            }
          }

          return newState as GlobalChatState;
        });
      },

      getCurrentMessages: () => {
        const { currentThreadId, threads } = get();
        if (currentThreadId && threads[currentThreadId]) {
          return threads[currentThreadId].messages;
        }
        return [];
      },

      updateThreadTitle: (threadId: string, title: string) => {
        set((state) => {
          const thread = state.threads[threadId];
          if (thread) {
            return {
              threads: {
                ...state.threads,
                [threadId]: {
                  ...thread,
                  title,
                  updatedAt: new Date().toISOString()
                }
              }
            };
          }
          return state;
        });
      },

      stopGeneration: () => {
        const { socket, currentThreadId } = get();
        if (socket && socket.readyState === WebSocket.OPEN && currentThreadId) {
          log.info("Sending stop signal to workflow");
          socket.send(encode({ type: "stop", thread_id: currentThreadId }));
          set({
            status: "connected",
            progress: { current: 0, total: 0 },
            statusMessage: null
          });
        }
      }
    }),
    {
      name: "global-chat-storage",
      // Only persist threads and currentThreadId
      partialize: (state): any => ({
        threads: state.threads || {},
        currentThreadId: state.currentThreadId || null
      }),
      onRehydrateStorage: () => (state) => {
        console.log("GlobalChatStore hydrated:", state);
      }
    }
  )
);

// Network status monitoring
if (typeof window !== "undefined") {
  // Listen for online/offline events
  window.addEventListener("online", () => {
    const state = useGlobalChatStore.getState();
    if (state.status === "disconnected" && !state.isIntentionalDisconnect) {
      log.info("Network came online, attempting to reconnect...");
      state.connect(state.workflowId || undefined).catch(error => {
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
      if (state.status === "disconnected" && !state.isIntentionalDisconnect) {
        log.info("Tab became visible, checking connection...");
        state.connect(state.workflowId || undefined).catch(error => {
          log.error("Failed to reconnect after tab visible:", error);
        });
      }
    }
  });
}

export default useGlobalChatStore;
