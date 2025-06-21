import { create } from "zustand";
import {
  JobUpdate,
  Message,
  MessageContent,
  NodeProgress,
  NodeUpdate,
  OutputUpdate,
  PlanningUpdate,
  Prediction,
  TaskUpdate,
  ToolCallUpdate,
  WorkflowAttributes
} from "./ApiTypes";
import { CHAT_URL, isLocalhost } from "./ApiClient";
import log from "loglevel";
import { decode, encode } from "@msgpack/msgpack";
import { handleUpdate } from "./workflowUpdates";
import { supabase } from "../lib/supabaseClient";
import { WebSocketManager, ConnectionState } from "../lib/websocket/WebSocketManager";

type WorkflowChatState = {
  wsManager: WebSocketManager | null;
  workflow: WorkflowAttributes | null;
  status: "disconnected" | "connecting" | "connected" | "loading" | "error" | "reconnecting" | "disconnecting" | "failed";
  messages: Message[];
  progressMessage: string | null;
  progress: number;
  total: number;
  error: string | null;
  connect: (workflow: WorkflowAttributes) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
};

export type MsgpackData =
  | JobUpdate
  | Prediction
  | NodeProgress
  | NodeUpdate
  | Message
  | ToolCallUpdate
  | TaskUpdate
  | PlanningUpdate
  | OutputUpdate;

const makeMessageContent = (type: string, data: Uint8Array): MessageContent => {
  const dataUri = URL.createObjectURL(new Blob([data]));
  if (type === "image") {
    return {
      type: "image_url",
      image: {
        type: "image",
        uri: dataUri
      }
    };
  } else if (type === "audio") {
    return {
      type: "audio",
      audio: {
        type: "audio",
        uri: dataUri
      }
    };
  } else if (type === "video") {
    return {
      type: "video",
      video: {
        type: "video",
        uri: dataUri
      }
    };
  } else {
    throw new Error(`Unknown message content type: ${type}`);
  }
};

const useWorkflowChatStore = create<WorkflowChatState>((set, get) => ({
  wsManager: null,
  messages: [],
  progressMessage: null,
  workflow: null,
  status: "disconnected",
  error: null,
  progress: 0,
  total: 0,
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
      binaryType: 'arraybuffer',
      reconnect: true,
      reconnectInterval: 1000,
      reconnectAttempts: 5,
      timeoutInterval: 30000
    });

    // Handle state changes
    wsManager.on('stateChange', (newState: ConnectionState) => {
      // Don't override loading status when we're processing a message
      if (newState === 'connected' && get().status === 'loading') {
        return;
      }
      set({ status: newState as WorkflowChatState['status'] });
    });

    // Handle connection open
    wsManager.on('open', () => {
      log.info("Chat WebSocket connected");
      set({ status: "connected" });
    });

    // Handle messages
    wsManager.on('message', (data: MsgpackData) => {
      if (data.type === "message") {
        set((state) => ({
          messages: [...state.messages, data as Message],
          status: "connected",
          progress: 0,
          total: 0
        }));
      } else {
        const workflow = get().workflow;
        if (!workflow) {
          throw new Error("Workflow is not connected");
        }
        handleUpdate(workflow, data);

        // Update local state based on the data type
        if (data.type === "job_update") {
          const update = data as JobUpdate;
          if (update.status === "completed") {
            set({
              progress: 0,
              total: 0,
              progressMessage: null,
              status: "connected"
            });
          } else if (update.status === "failed") {
            set({
              error: update.error,
              status: "error",
              progress: 0,
              total: 0,
              progressMessage: null
            });
          }
        } else if (data.type === "output_update") {
          const update = data as OutputUpdate;
          if (update.output_type === "string") {
            const messages = get().messages;
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              // Check if this is the end of stream marker
              if (update.value === "<nodetool_end_of_stream>") {
                // Message is complete, do nothing
                return;
              }
              // Append to the last assistant message
              const updatedMessage: Message = {
                ...lastMessage,
                content: lastMessage.content + (update.value as string)
              };
              set({ messages: [...messages.slice(0, -1), updatedMessage] });
            } else {
              // Create a new assistant message
              const message: Message = {
                role: "assistant" as const,
                type: "message" as const,
                content: update.value as string,
                workflow_id: get().workflow?.id
              };
              set({ messages: [...messages, message] });
            }
          } else if (update.output_type === "image") {
            const message: Message = {
              role: "assistant" as const,
              type: "message" as const,
              content: [
                makeMessageContent(
                  "image",
                  (update?.value as { data: Uint8Array }).data
                )
              ],
              workflow_id: get().workflow?.id
            };
            set({ messages: [...get().messages, message] });
          }
        } else if (data.type === "node_update") {
          const update = data as NodeUpdate;
          if (update.status === "completed") {
            set({ progress: 0, total: 0, progressMessage: null });
          }
        } else if (data.type === "node_progress") {
          const progress = data as NodeProgress;
          set({
            progress: progress.progress,
            total: progress.total,
            progressMessage: null
          });
        } else if (data.type === "tool_call_update") {
          const update = data as ToolCallUpdate;
          set({ progressMessage: update.message });
        }
      }
    });

    // Handle errors
    wsManager.on('error', (error: Error) => {
      log.error("Chat WebSocket error:", error);
      if (!isLocalhost) {
        set({
          status: "error",
          error: "Connection failed. This may be due to an authentication issue."
        });
      }
    });

    // Handle close
    wsManager.on('close', (code: number, reason: string) => {
      log.info("Chat WebSocket disconnected", { code, reason });
      set({ status: "disconnected" });
    });

    // Handle reconnection attempts
    wsManager.on('reconnecting', (attempt: number, maxAttempts: number) => {
      log.info(`Reconnecting to chat WebSocket (${attempt}/${maxAttempts})`);
      set({ status: "reconnecting" });
    });

    set({ wsManager });

    try {
      await wsManager.connect();
    } catch (error) {
      log.error("Failed to connect to chat WebSocket:", error);
      set({
        status: "error",
        error: "Failed to connect to chat service"
      });
      throw error;
    }
  },

  disconnect: () => {
    const { wsManager } = get();
    if (wsManager) {
      wsManager.disconnect();
      set({ wsManager: null });
    }
  },

  sendMessage: async (message: Message) => {
    const { wsManager } = get();

    set({ error: null });

    if (!message.workflow_id) {
      throw new Error("Workflow ID is required");
    }

    if (!wsManager || !wsManager.isConnected()) {
      return;
    }

    set((state) => ({
      messages: [...state.messages, message],
      status: "loading"
    }));

    try {
      wsManager.send(message);
    } catch (error) {
      log.error("Failed to send message:", error);
      set({
        status: "error",
        error: "Failed to send message"
      });
      throw error;
    }
  },

  resetMessages: () => {
    set({ messages: [] });
  }
}));

export default useWorkflowChatStore;
