import { create } from "zustand";
import { JobUpdate, Message, NodeProgress, NodeUpdate } from "./ApiTypes";
import { CHAT_URL } from "./ApiClient";
import { useAuth } from "./useAuth";
import { devError, devLog } from "../utils/DevLog";
import msgpack from "msgpack-lite";
import { useNodeStore } from "./NodeStore";
import { handleUpdate } from "./workflowUpdates";

type WorkflowChatState = {
  socket: WebSocket | null;
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  messages: Message[];
  currentNodeName: string | null;
  progress: number;
  total: number;
  error: string | null;
  workflow_id: string | null;
  connect: (workflow_id: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
};

const useWorkflowChatStore = create<WorkflowChatState>((set, get) => ({
  socket: null,
  messages: [],
  currentNodeName: null,
  status: "disconnected",
  error: null,
  progress: 0,
  total: 0,
  workflow_id: null,
  connect: async (workflow_id: string) => {
    const user = useAuth.getState().getUser();
    if (!user) {
      throw new Error("User is not logged in");
    }
    devLog("Connecting to workflow chat", workflow_id);

    set({ workflow_id });

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
      const data = msgpack.decode(new Uint8Array(arrayBuffer));

      if (data.type === "message") {
        set((state) => ({
          messages: [...state.messages, data as Message],
          status: "connected",
          progress: 0,
          total: 0
        }));
      } else {
        const workflow = useNodeStore.getState().getWorkflow();
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
    const workflow = useNodeStore.getState().getWorkflow();

    if (!user) {
      throw new Error("User is not logged in");
    }

    set({ error: null });

    message.auth_token = user.auth_token;
    message.graph = workflow.graph;

    if (!message.workflow_id) {
      throw new Error("Workflow ID is required");
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      await get().connect(message.workflow_id);
    }

    set((state) => ({
      messages: [...state.messages, message],
      status: "loading"
    }));

    socket?.send(msgpack.encode(message));
  },

  resetMessages: () => {
    set({ messages: [] });
  }
}));

export default useWorkflowChatStore;
