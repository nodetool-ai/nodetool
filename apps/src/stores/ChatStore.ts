import { create } from "zustand";
import { encode, decode } from "@msgpack/msgpack";
import {
  Message,
  ToolCall,
  MessageContent as WorkflowMessageContent,
  MsgpackData,
  JobUpdate,
  NodeUpdate,
  NodeProgress,
  OutputUpdate,
  ToolCallUpdate,
} from "../types/workflow";

type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error";

interface ChatState {
  status: ChatStatus;
  statusMessage: string;
  messages: (Message | ToolCall)[];
  progress: { current: number; total: number };
  error: string | null;
  workflowId: string | null;
  socket: WebSocket | null;
  chatUrl: string;
  droppedFiles: File[];
  selectedTools: string[];
  currentNode: string;
  chunks: string;
  // Actions
  connect: (workflowId?: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
  appendMessage: (message: Message) => void;
  setDroppedFiles: (files: File[]) => void;
  setSelectedTools: (tools: string[]) => void;
}

const makeMessageContent = (
  type: string,
  data: Uint8Array
): WorkflowMessageContent => {
  const dataUri = URL.createObjectURL(new Blob([data]));
  if (type === "image") {
    return {
      type: "image_url",
      image: {
        type: "image",
        uri: dataUri,
      },
    } as WorkflowMessageContent;
  } else if (type === "audio") {
    return {
      type: "audio",
      audio: {
        type: "audio",
        uri: dataUri,
      },
    } as WorkflowMessageContent;
  } else if (type === "video") {
    return {
      type: "video",
      video: {
        type: "video",
        uri: dataUri,
      },
    } as WorkflowMessageContent;
  } else {
    throw new Error(`Unknown message content type: ${type}`);
  }
};

const useChatStore = create<ChatState>((set, get) => ({
  status: "disconnected",
  statusMessage: "",
  messages: [],
  chunks: "",
  results: {},
  progress: { current: 0, total: 0 },
  currentNode: "",
  error: null,
  workflowId: null,
  socket: null,
  chatUrl: "ws://127.0.0.1:8000/chat",
  droppedFiles: [],
  selectedTools: [],
  appendMessage: (message: Message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  connect: async (workflowId?: string) => {
    get().disconnect();

    set({ workflowId: workflowId || null, status: "connecting" });
    const socket = new WebSocket(get().chatUrl);

    const createMessageFromChunks = () => {
      const chunks = get().chunks;
      const message: Message = {
        role: "assistant",
        type: "message",
        content: chunks,
        workflow_id: get().workflowId,
        name: "assistant",
      };
      set({ messages: [...get().messages, message], chunks: "" });
    };

    socket.onopen = () => {
      console.log("Chat WebSocket connected");
      set({ status: "connected" });
    };

    socket.onmessage = async (event: MessageEvent) => {
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;
      console.log("Received message:", data);

      if (data.type === "message") {
        set((state) => ({
          chunks: "",
          messages: [...state.messages, data as Message],
          status: "connected",
          progress: { current: 0, total: 0 },
          currentNode: "",
        }));
      } else if (data.type === "job_update") {
        const update = data as JobUpdate;
        if (update.status === "completed") {
          createMessageFromChunks();
          set({
            progress: { current: 0, total: 0 },
            status: "connected",
            currentNode: "",
            statusMessage: "",
            chunks: "",
          });
        } else if (update.status === "failed") {
          set({
            error: update.error,
            status: "error",
            progress: { current: 0, total: 0 },
            currentNode: "",
            statusMessage: update.error,
          });
        }
      } else if (data.type === "node_update") {
        const update = data as NodeUpdate;
        if (update.status === "completed") {
          set({
            progress: { current: 0, total: 0 },
            currentNode: "",
            statusMessage: "",
          });
        } else {
          set({
            statusMessage: update.node_name,
          });
        }
      } else if (data.type === "chunk") {
        set({
          status: "loading",
          chunks: get().chunks + data.content,
        });
      } else if (data.type === "output_update") {
        const update = data as OutputUpdate;
        if (update.output_type === "string") {
          set({ chunks: get().chunks + update.value });
        } else if (["image", "audio", "video"].includes(update.output_type)) {
          const message: Message = {
            role: "assistant",
            type: "message",
            content: [
              makeMessageContent(
                update.output_type,
                (update?.value as { data: Uint8Array }).data
              ),
            ],
            workflow_id: get().workflowId,
            name: "assistant",
          };
          set({ messages: [...get().messages, message] });
        }
      } else if (data.type === "tool_call_update") {
        const update = data as ToolCallUpdate;
        set({
          statusMessage: update.message,
        });
      } else if (data.type === "node_progress") {
        const progress = data as NodeProgress;
        if (progress.chunk) {
          set({
            status: "loading",
            chunks: get().chunks + progress.chunk,
          });
        } else {
          set({
            status: "loading",
            progress: {
              current: progress.progress,
              total: progress.total,
            },
            currentNode: progress.node_id,
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
  setSelectedTools: (tools) => set({ selectedTools: tools }),
}));

export default useChatStore;
