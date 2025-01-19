import { create } from "zustand";
import { encode, decode } from "@msgpack/msgpack";
import { Message } from "./types/workflow";

type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error";

interface ChatState {
  status: ChatStatus;
  messages: Message[];
  progress: number;
  total: number;
  error: string | null;
  workflowId: string | null;
  socket: WebSocket | null;
  chatUrl: string;
  droppedFiles: File[];
  isDragging: boolean;
  currentNode: string;
  // Actions
  connect: (workflowId: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
  appendMessage: (message: Message) => void;

  setDroppedFiles: (files: File[]) => void;
  addDroppedFiles: (files: File[]) => void;
  removeDroppedFile: (fileToRemove: File) => void;
  setIsDragging: (isDragging: boolean) => void;
}

const useChatStore = create<ChatState>((set, get) => ({
  status: "disconnected",
  messages: [],
  results: {},
  progress: 0,
  total: 0,
  currentNode: "",
  error: null,
  workflowId: null,
  socket: null,
  chatUrl: "ws://127.0.0.1:8000/chat",
  droppedFiles: [],
  isDragging: false,
  appendMessage: (message: Message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  connect: async (workflowId: string) => {
    get().disconnect();

    set({ workflowId, status: "connecting" });
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
          progress: 0,
          total: 0,
          currentNode: "",
        }));
      } else if (data.type === "job_update") {
        if (data.status === "completed") {
          set({
            progress: 0,
            total: 0,
            status: "connected",
            currentNode: "",
          });
        } else if (data.status === "failed") {
          set({
            error: data.error,
            status: "error",
            progress: 0,
            total: 0,
            currentNode: "",
          });
        }
      } else if (data.type === "node_update") {
        if (data.status === "completed") {
          set({
            progress: 0,
            total: 0,
            currentNode: data.node_name,
          });
        }
      } else if (data.type === "node_progress") {
        set({
          progress: data.progress,
          total: data.total,
          currentNode: data.node_name,
        });
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
    set((state) => ({
      messages: [...state.messages, message],
      status: "loading",
    }));
    socket?.send(encode(message));
  },

  resetMessages: () => set({ messages: [] }),
  setDroppedFiles: (files) => set({ droppedFiles: files }),
  addDroppedFiles: (files) =>
    set((state) => ({
      droppedFiles: [...state.droppedFiles, ...files],
    })),
  removeDroppedFile: (fileToRemove) =>
    set((state) => ({
      droppedFiles: state.droppedFiles.filter((file) => file !== fileToRemove),
    })),
  setIsDragging: (isDragging) => set({ isDragging }),
}));

export default useChatStore;
