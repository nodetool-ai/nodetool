import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  JobUpdate,
  Message,
  MessageContent,
  MessageImageContent,
  MessageAudioContent,
  MessageVideoContent,
  NodeProgress,
  NodeUpdate,
  OutputUpdate,
  PlanningUpdate,
  Prediction,
  TaskUpdate,
  ToolCallUpdate,
  WorkflowAttributes,
  Chunk,
  SubTaskResult,
  Notification,
  EdgeUpdate,
  PreviewUpdate,
  LogUpdate
} from "./ApiTypes";
import { CHAT_URL, isLocalhost } from "./ApiClient";
import log from "loglevel";
import { handleUpdate } from "./workflowUpdates";
import { supabase } from "../lib/supabaseClient";
import {
  WebSocketManager,
  ConnectionState
} from "../lib/websocket/WebSocketManager";
import { uuidv4 } from "./uuidv4";

// Include additional runtime statuses used during message streaming
type ChatStatus = ConnectionState | "loading" | "streaming" | "error";

// WorkflowChatStore uses a local thread structure with messages stored inline
interface WorkflowThread {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

type WorkflowChatState = {
  // Connection state
  wsManager: WebSocketManager | null;
  socket: WebSocket | null;
  workflow: WorkflowAttributes | null;
  status: ChatStatus;
  statusMessage: string | null;
  progress: { current: number; total: number };
  error: string | null;

  // Thread management
  threads: Record<string, WorkflowThread>;
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
  connect: (workflow: WorkflowAttributes) => Promise<void>;
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
};

export type MsgpackData =
  | JobUpdate
  | Chunk
  | Prediction
  | NodeProgress
  | NodeUpdate
  | Message
  | LogUpdate
  | ToolCallUpdate
  | TaskUpdate
  | PlanningUpdate
  | OutputUpdate
  | SubTaskResult
  | WorkflowCreatedUpdate
  | WorkflowUpdatedUpdate
  | PreviewUpdate
  | EdgeUpdate
  | Notification;

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
  // const dataUri = URL.createObjectURL(new Blob([data]));
  if (type === "image") {
    return {
      type: "image_url",
      image: {
        type: "image",
        data: data,
        uri: ""
      }
    } as MessageImageContent;
  } else if (type === "audio") {
    return {
      type: "audio",
      audio: {
        type: "audio",
        data: data,
        uri: ""
      }
    } as MessageAudioContent;
  } else if (type === "video") {
    return {
      type: "video",
      video: {
        type: "video",
        data: data,
        uri: ""
      }
    } as MessageVideoContent;
  } else {
    throw new Error(`Unknown message content type: ${type}`);
  }
};

const useWorkflowChatStore = create<WorkflowChatState>()((set, get) => ({
  // Connection state
  wsManager: null,
  socket: null,
  workflow: null,
  status: "disconnected",
  statusMessage: null,
  progress: { current: 0, total: 0 },
  error: null,

  // Thread state
  threads: {} as Record<string, WorkflowThread>,
  currentThreadId: null as string | null,

  // Agent mode - NOT SUPPORTED IN WORKFLOW CHAT
  agentMode: false,
  setAgentMode: (enabled: boolean) => {}, // No-op for workflow chat

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
  connect: async (workflow: WorkflowAttributes) => {
    log.info("Connecting to workflow chat", workflow.id);

    set({ workflow });

    if (get().wsManager) {
      get().disconnect();
    }

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

    const wsManager = new WebSocketManager({
      url: wsUrl,
      binaryType: "arraybuffer",
      reconnect: true,
      reconnectInterval: 1000,
      reconnectAttempts: 5,
      timeoutInterval: 30000
    });

    // Handle state changes
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

    // Handle connection open
    wsManager.on("open", () => {
      log.info("Chat WebSocket connected");
      set({ socket: wsManager.getWebSocket() });
    });

    // Handle messages
    wsManager.on("message", (data: MsgpackData) => {
      handleWebSocketMessage(data, set, get);
    });

    // Handle errors
    wsManager.on("error", (error: Error) => {
      log.error("Chat WebSocket error:", error);
      let errorMessage = error.message;

      if (!isLocalhost) {
        errorMessage += " This may be due to an authentication issue.";
      }

      set({
        error: errorMessage
      });
    });

    // Handle close
    wsManager.on("close", (code: number, reason: string) => {
      set({ socket: null });
      if (code === 1008 || code === 4001 || code === 4003) {
        // Authentication errors
        set({
          error: "Authentication failed. Please log in again."
        });
      }
    });

    // Handle reconnection attempts
    wsManager.on("reconnecting", (attempt: number, maxAttempts: number) => {
      set({
        statusMessage: `Reconnecting... (attempt ${attempt}/${maxAttempts})`
      });
    });

    set({ wsManager, socket: null });

    try {
      await wsManager.connect();
    } catch (error) {
      log.error("Failed to connect to chat WebSocket:", error);
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
    const { wsManager, currentThreadId, workflow } = get();

    set({ error: null });

    if (!message.workflow_id && workflow) {
      message.workflow_id = workflow.id;
    }

    if (!message.workflow_id) {
      throw new Error("Workflow ID is required");
    }

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
      thread_id: threadId,
      agent_mode: false // Always false for workflow chat
    };

    // Add message to thread
    const thread = get().threads[threadId];
    if (thread) {
      // Auto-generate title from first user message if not set
      let title = thread.title;
      if (!title && thread.messages.length === 0 && message.role === "user") {
        const content =
          typeof message.content === "string"
            ? message.content
            : Array.isArray(message.content) &&
              message.content[0]?.type === "text"
            ? (message.content[0] as any).text
            : "New conversation";
        title = content.substring(0, 50) + (content.length > 50 ? "..." : "");
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
      set({
        error: error instanceof Error ? error.message : "Failed to send message"
      });
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
      const newState: Partial<WorkflowChatState> = {
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

      return newState as WorkflowChatState;
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
}));

// WebSocket message handler
function handleWebSocketMessage(
  data: MsgpackData,
  set: (
    state:
      | Partial<WorkflowChatState>
      | ((state: WorkflowChatState) => Partial<WorkflowChatState>)
  ) => void,
  get: () => WorkflowChatState
) {
  console.log(data);

  const workflow = get().workflow;
  if (!workflow) {
    log.error("No workflow connected");
    return;
  }

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
        const messages = thread.messages;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          // Handle mixed content types - preserve array structure if it exists
          let updatedContent: string | MessageContent[];
          if (Array.isArray(lastMessage.content)) {
            // If content is an array, append text to the last text item or add new text item
            const contentArray = [...lastMessage.content];
            const lastItem = contentArray[contentArray.length - 1];
            if (lastItem && lastItem.type === "text") {
              // Append to existing text item
              contentArray[contentArray.length - 1] = {
                ...lastItem,
                text: lastItem.text + chunk.content
              };
            } else {
              // Add new text item
              contentArray.push({
                type: "text",
                text: chunk.content
              });
            }
            updatedContent = contentArray;
          } else {
            // If content is a string, convert to array with text item
            updatedContent = [
              {
                type: "text",
                text: ((lastMessage.content as string) || "") + chunk.content
              }
            ];
          }

          const updatedMessage: Message = {
            ...lastMessage,
            content: updatedContent
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
            workflow_id: workflow.id
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
          const messages = thread.messages;
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            // Check if this is the end of stream marker
            if (update.value === "<nodetool_end_of_stream>") {
              return;
            }

            // Handle mixed content types - preserve array structure if it exists
            let updatedContent: string | MessageContent[];
            if (Array.isArray(lastMessage.content)) {
              // If content is an array, append text to the last text item or add new text item
              const contentArray = [...lastMessage.content];
              const lastItem = contentArray[contentArray.length - 1];
              if (lastItem && lastItem.type === "text") {
                // Append to existing text item
                contentArray[contentArray.length - 1] = {
                  ...lastItem,
                  text: lastItem.text + (update.value as string)
                };
              } else {
                // Add new text item
                contentArray.push({
                  type: "text",
                  text: update.value as string
                });
              }
              updatedContent = contentArray;
            } else {
              // If content is a string, append to it
              updatedContent =
                ((lastMessage.content as string) || "") +
                (update.value as string);
            }

            const updatedMessage: Message = {
              ...lastMessage,
              content: updatedContent
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
              workflow_id: workflow.id
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
            workflow_id: workflow.id,
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
      // Add a message to the thread about the updated workflow
      const message: Message = {
        role: "assistant",
        type: "message",
        content: "Workflow updated successfully!",
        workflow_id: workflow.id,
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
        workflow_id: workflow.id,
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
    const threadId = get().currentThreadId;

    // Set error state
    set({
      error: errorData.message || "An error occurred",
      status: "error",
      statusMessage: errorData.message
    });

    // Add error message to thread
    if (threadId) {
      const errorMessage: Message = {
        role: "assistant",
        type: "message",
        content: errorData.message || "An error occurred",
        workflow_id: workflow.id,
        error_type: errorData.error_type || "unknown"
      };

      set((state) => {
        const thread = state.threads[threadId];
        if (thread) {
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                messages: [...thread.messages, errorMessage],
                updatedAt: new Date().toISOString()
              }
            }
          };
        }
        return state;
      });
    }
  } else {
    // Handle workflow updates for backward compatibility
    handleUpdate(workflow, data);
  }
}

export default useWorkflowChatStore;
