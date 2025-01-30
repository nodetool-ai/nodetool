import { create } from "zustand";
import {
  JobUpdate,
  Message,
  NodeProgress,
  NodeUpdate,
  Prediction,
  WorkflowAttributes
} from "./ApiTypes";
import { CHAT_URL } from "./ApiClient";
import { useAuth } from "./useAuth";
import { devError, devLog } from "../utils/DevLog";
import { decode, encode } from "@msgpack/msgpack";
import { handleUpdate } from "./workflowUpdates";

type WorkflowChatState = {
  socket: WebSocket | null;
  workflow: WorkflowAttributes | null;
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  messages: Message[];
  currentNodeName: string | null;
  progress: number;
  total: number;
  error: string | null;
  connect: (workflow: WorkflowAttributes) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
};

type MsgpackData = JobUpdate | Prediction | NodeProgress | NodeUpdate | Message;

const useWorkflowChatStore = create<WorkflowChatState>((set, get) => ({
  socket: null,
  messages: [],
  currentNodeName: null,
  workflow: null,
  status: "disconnected",
  error: null,
  progress: 0,
  total: 0,
  connect: async (workflow: WorkflowAttributes) => {
    const user = useAuth.getState().getUser();
    if (!user) {
      throw new Error("User is not logged in");
    }
    devLog("Connecting to workflow chat", workflow.id);

    set({ workflow });

    if (get().socket) {
      get().disconnect();
    }

    set({ status: "connecting" });

    const socket = new WebSocket(CHAT_URL);

    socket.onopen = () => {
      devLog("Chat WebSocket connected");
      set({ socket, status: "connected" });
    };

    socket.onmessage = async (event) => {
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;

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
              currentNodeName: null,
              progress: 0,
              total: 0,
              status: "connected"
            });
          } else if (update.status === "failed") {
            set({
              error: update.error,
              status: "error",
              currentNodeName: null,
              progress: 0,
              total: 0
            });
          }
        } else if (data.type === "node_update") {
          const update = data as NodeUpdate;
          set({ currentNodeName: update.node_name });
          if (update.status === "completed") {
            set({ progress: 0, total: 0 });
          }
        } else if (data.type === "node_progress") {
          const progress = data as NodeProgress;
          set({ progress: progress.progress, total: progress.total });
        }
      }
    };

    socket.onerror = (error) => {
      devError("Chat WebSocket error:", error);
    };

    socket.onclose = () => {
      devLog("Chat WebSocket disconnected");
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
    const user = useAuth.getState().getUser();

    if (!user) {
      throw new Error("User is not logged in");
    }

    set({ error: null });

    message.auth_token = user.auth_token;

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
