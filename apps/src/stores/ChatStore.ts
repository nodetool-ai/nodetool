import { create } from "zustand";
import { encode, decode } from "@msgpack/msgpack";
import { Message } from "../types/workflow";

type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error";

interface ChatState {
  status: ChatStatus;
  statusMessage: string;
  messages: Message[];
  progress: { current: number; total: number };
  error: string | null;
  workflowId: string | null;
  socket: WebSocket | null;
  chatUrl: string;
  droppedFiles: File[];
  currentNode: string;
  streamingMessage: string;
  // Actions
  connect: (workflowId?: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
  appendMessage: (message: Message) => void;
  setDroppedFiles: (files: File[]) => void;
}

const useChatStore = create<ChatState>((set, get) => ({
  status: "disconnected",
  statusMessage: "",
  messages: [],
  streamingMessage: "",
  results: {},
  progress: { current: 0, total: 0 },
  currentNode: "",
  error: null,
  workflowId: null,
  socket: null,
  chatUrl: "ws://127.0.0.1:8000/chat",
  droppedFiles: [],
  appendMessage: (message: Message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  connect: async (workflowId?: string) => {
    get().disconnect();

    set({ workflowId: workflowId || null, status: "connecting" });
    const socket = new WebSocket(get().chatUrl);

    socket.onopen = () => {
      console.log("Chat WebSocket connected");
      set({ status: "connected" });
    };

    socket.onmessage = async (event: MessageEvent) => {
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as any;
      console.log("Received message:", data);

      if (data.type === "message") {
        set((state) => ({
          messages: [...state.messages, data],
          status: "connected",
          progress: { current: 0, total: 0 },
          currentNode: "",
        }));
      } else if (data.type === "job_update") {
        if (data.status === "completed") {
          set({
            progress: { current: 0, total: 0 },
            status: "connected",
            currentNode: "",
            statusMessage: "",
            streamingMessage: "",
          });
        } else if (data.status === "failed") {
          set({
            error: data.error,
            status: "error",
            progress: { current: 0, total: 0 },
            currentNode: "",
            statusMessage: data.error,
          });
        }
      } else if (data.type === "node_update") {
        if (data.status === "completed") {
          set({
            progress: { current: 0, total: 0 },
            currentNode: "",
            statusMessage: "",
          });
        } else {
          set({
            statusMessage: `${data.node_name} ${data.status}`,
          });
        }
      } else if (data.type === "node_progress") {
        if (data.chunk.length > 0) {
          set({
            streamingMessage: get().streamingMessage + data.chunk,
          });
        } else {
          set({
            progress: {
              current: data.progress,
              total: data.total,
            },
            currentNode: data.node_name,
          });
        }
      }
    };

    socket.onerror = (error: Event) => {
      console.error("Chat WebSocket error:", error);
      set({ error: "WebSocket connection error" });
    };

    socket.onclose = () => {
      console.log("Chat WebSocket disconnected");
      set({ status: "disconnected" });
    };

    set({ socket: socket });

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
      set({ socket: null, status: "disconnected" });
    }
  },

  sendMessage: async (message: Message) => {
    const { socket } = get();
    if (!socket) {
      throw new Error("WebSocket connection not established");
    }
    set((state) => ({
      messages: [...state.messages, message],
      status: "loading",
    }));
    socket?.send(encode(message));
  },

  resetMessages: () => set({ messages: [] }),
  setDroppedFiles: (files) => set({ droppedFiles: files }),
}));

export default useChatStore;
