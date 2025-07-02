import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  SubTaskResult
} from "./ApiTypes";
import { CHAT_URL, isLocalhost } from "./ApiClient";
import log from "loglevel";
import { supabase } from "../lib/supabaseClient";
import { uuidv4 } from "./uuidv4";
import { WebSocketManager, ConnectionState } from "../lib/websocket/WebSocketManager";

// Include additional runtime statuses used during message streaming
type ChatStatus = ConnectionState | "loading" | "streaming" | "error";

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
  
  // WebSocket manager
  wsManager: WebSocketManager | null;
  socket: WebSocket | null;

  // Thread management
  threads: Record<string, Thread>;
  currentThreadId: string | null;

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
  | OutputUpdate
  | SubTaskResult
  | WorkflowCreatedUpdate;

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

      // Agent mode
      agentMode: false,
      setAgentMode: (enabled: boolean) => set({ agentMode: enabled }),

      // Planning updates
      currentPlanningUpdate: null,
      setPlanningUpdate: (update: PlanningUpdate | null) => set({ currentPlanningUpdate: update }),

      // Task updates
      currentTaskUpdate: null,
      setTaskUpdate: (update: TaskUpdate | null) => set({ currentTaskUpdate: update }),

      // Workflow graph updates
      lastWorkflowGraphUpdate: null,

      connect: async (workflowId?: string) => {
        log.info("Connecting to global chat");
        
        const state = get();
        
        // Clean up existing connection
        if (state.wsManager) {
          state.wsManager.destroy();
        }

        // Get authentication URL
        let wsUrl = CHAT_URL;
        if (!isLocalhost) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              wsUrl = `${CHAT_URL}?api_key=${session.access_token}`;
              log.debug("Adding authentication to WebSocket connection");
            } else {
              log.warn("No Supabase session found, connecting without authentication");
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
          binaryType: 'arraybuffer'
        });

        // Set up event handlers
        wsManager.on('stateChange', (newState: ConnectionState) => {
          // Don't override loading status when WebSocket connects
          const currentState = get();
          if (newState === 'connected' && currentState.status === 'loading') {
            // Keep loading status if we're waiting for a response
            set({ 
              error: null, 
              statusMessage: null
            });
          } else {
            set({ status: newState });
            
            if (newState === 'connected') {
              set({ 
                error: null, 
                statusMessage: null
              });
            }
          }
        });

        wsManager.on('reconnecting', (attempt: number, maxAttempts: number) => {
          set({
            statusMessage: `Reconnecting... (attempt ${attempt}/${maxAttempts})`
          });
        });

        wsManager.on('message', (data: MsgpackData) => {
          handleWebSocketMessage(data, set, get);
        });

        wsManager.on('open', () => {
          set({ socket: wsManager.getWebSocket() });
        });

        wsManager.on('error', (error: Error) => {
          log.error("WebSocket error:", error);
          let errorMessage = error.message;
          
          if (!isLocalhost) {
            errorMessage += " This may be due to an authentication issue.";
          }
          
          set({
            error: errorMessage
          });
        });

        wsManager.on('close', (code: number, reason: string) => {
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
          threadId = get().createNewThread();
        }

        // Prepare message
        const messageToSend = {
          ...message,
          workflow_id: workflowId || undefined,
          thread_id: threadId,
          agent_mode: agentMode
        };

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
                messages: [...thread.messages, messageToSend],
                updatedAt: new Date().toISOString(),
                ...(title && !thread.title ? { title } : {})
              }
            },
            status: "loading" // Waiting for response
          }));
        }

        try {
          wsManager.send(messageToSend);
        } catch (error) {
          log.error("Failed to send message:", error);
          set({ error: error instanceof Error ? error.message : "Failed to send message" });
          throw error;
        }
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
        const { wsManager, currentThreadId } = get();
        if (wsManager && wsManager.isConnected() && currentThreadId) {
          log.info("Sending stop signal to workflow");
          try {
            wsManager.send({ type: "stop", thread_id: currentThreadId });
            set({
              status: "connected",
              progress: { current: 0, total: 0 },
              statusMessage: null
            });
          } catch (error) {
            log.error("Failed to send stop signal:", error);
          }
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
        // State has been rehydrated from storage
        if (state) {
          // Ensure threads is always an object
          if (!state.threads) {
            state.threads = {};
          }
        }
      }
    }
  )
);

// WebSocket message handler
function handleWebSocketMessage(
  data: MsgpackData,
  set: (state: Partial<GlobalChatState> | ((state: GlobalChatState) => Partial<GlobalChatState>)) => void,
  get: () => GlobalChatState
) {
  console.log(data);

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
      set({ status: "connected", progress: { current: 0, total: 0 }, statusMessage: null });
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
            statusMessage: null,
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
            statusMessage: null,
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
          set({ status: "connected", statusMessage: null, currentPlanningUpdate: null, currentTaskUpdate: null });
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
            statusMessage: null,
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
            statusMessage: null
          };
        }
        return state;
      });
    }
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

export default useGlobalChatStore;