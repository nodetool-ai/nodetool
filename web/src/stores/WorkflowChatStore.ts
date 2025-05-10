import { create } from "zustand";
import {
  Chunk,
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

type WorkflowChatState = {
  socket: WebSocket | null;
  workflow: WorkflowAttributes | null;
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  messages: Message[];
  progressMessage: string | null;
  progress: number;
  total: number;
  chunks: string;
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
  | Chunk
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
  socket: null,
  messages: [],
  progressMessage: null,
  chunks: "",
  workflow: null,
  status: "disconnected",
  error: null,
  progress: 0,
  total: 0,
  connect: async (workflow: WorkflowAttributes) => {
    log.info("Connecting to workflow chat", workflow.id);

    set({ workflow });

    if (get().socket) {
      get().disconnect();
    }

    set({ status: "connecting" });

    const createMessageFromChunks = () => {
      const chunks = get().chunks;
      const message = {
        role: "assistant",
        type: "message",
        content: chunks,
        workflow_id: get().workflow?.id
      };
      set({ messages: [...get().messages, message], chunks: "" });
    };

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

    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      log.info("Chat WebSocket connected");
      set({ socket, status: "connected" });
    };

    socket.onmessage = async (event) => {
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;

      console.log(data);

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
            createMessageFromChunks();
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
            set({ chunks: get().chunks + update.value });
          } else if (update.output_type === "image") {
            const message = {
              role: "assistant",
              type: "message",
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
        } else if (data.type === "chunk") {
          const chunk = data as Chunk;
          const currentChunk = get().chunks;
          set({ chunks: currentChunk + chunk.content });
        }
      }
    };

    socket.onerror = (error) => {
      log.error("Chat WebSocket error:", error);
      if (!isLocalhost) {
        set({
          status: "error",
          error:
            "Connection failed. This may be due to an authentication issue."
        });
      }
    };

    socket.onclose = () => {
      log.info("Chat WebSocket disconnected");
      set({ socket: null, status: "disconnected" });
    };

    set({ socket });

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null });
    }
  },

  sendMessage: async (message: Message) => {
    const { socket } = get();

    set({ error: null });

    if (!message.workflow_id) {
      throw new Error("Workflow ID is required");
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    set((state) => ({
      messages: [...state.messages, message],
      status: "loading"
    }));

    socket?.send(encode(message));
  },

  resetMessages: () => {
    set({ messages: [] });
  }
}));

export default useWorkflowChatStore;
