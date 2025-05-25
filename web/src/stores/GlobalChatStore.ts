import { create } from "zustand";
import { encode, decode } from "@msgpack/msgpack";
import {
  Message,
  MessageContent,
  JobUpdate,
  NodeUpdate,
  NodeProgress,
  OutputUpdate,
  ToolCallUpdate,
} from "./ApiTypes";
import { CHAT_URL } from "./ApiClient";

type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error";

interface GlobalChatState {
  status: ChatStatus;
  statusMessage: string | null;
  messages: Message[];
  progress: { current: number; total: number };
  error: string | null;
  workflowId: string | null;
  socket: WebSocket | null;
  droppedFiles: File[];
  chunks: string;
  connect: (workflowId?: string) => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
}

export type MsgpackData =
  | JobUpdate
  | NodeProgress
  | NodeUpdate
  | Message
  | ToolCallUpdate
  | OutputUpdate;

const makeMessageContent = (
  type: string,
  data: Uint8Array
): MessageContent => {
  const dataUri = URL.createObjectURL(new Blob([data]));
  if (type === "image") {
    return {
      type: "image_url",
      image: { type: "image", uri: dataUri },
    } as MessageContent;
  } else if (type === "audio") {
    return {
      type: "audio",
      audio: { type: "audio", uri: dataUri },
    } as MessageContent;
  } else if (type === "video") {
    return {
      type: "video",
      video: { type: "video", uri: dataUri },
    } as MessageContent;
  }
  throw new Error(`Unknown message content type: ${type}`);
};

const useGlobalChatStore = create<GlobalChatState>((set, get) => ({
  status: "disconnected",
  statusMessage: "",
  messages: [],
  progress: { current: 0, total: 0 },
  error: null,
  workflowId: null,
  socket: null,
  droppedFiles: [],
  chunks: "",

  connect: async (workflowId?: string) => {
    get().disconnect();
    set({ workflowId: workflowId || null, status: "connecting" });
    const socket = new WebSocket(CHAT_URL);

    const createMessageFromChunks = () => {
      const chunks = (get() as any).chunks as string;
      if (!chunks) return;
      const message: Message = {
        role: "assistant",
        type: "message",
        content: chunks,
        workflow_id: get().workflowId,
        name: "assistant",
      } as Message;
      set({ messages: [...get().messages, message], chunks: "" });
    };

    socket.onopen = () => {
      set({ status: "connected" });
    };

    socket.onmessage = async (event: MessageEvent) => {
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;

      if (data.type === "message") {
        set((state) => ({
          messages: [...state.messages, data as Message],
          status: "connected",
          progress: { current: 0, total: 0 },
          statusMessage: "",
        }));
      } else if (data.type === "job_update") {
        const update = data as JobUpdate;
        if (update.status === "completed") {
          createMessageFromChunks();
          set({
            progress: { current: 0, total: 0 },
            status: "connected",
            statusMessage: "",
          });
        } else if (update.status === "failed") {
          set({
            error: update.error,
            status: "error",
            progress: { current: 0, total: 0 },
            statusMessage: update.error || "",
          });
        }
      } else if (data.type === "node_update") {
        const update = data as NodeUpdate;
        if (update.status === "completed") {
          set({ progress: { current: 0, total: 0 }, statusMessage: "" });
        } else {
          set({ statusMessage: update.node_name });
        }
      } else if (data.type === "chunk") {
        set((state: any) => ({
          status: "loading",
          chunks: (state.chunks || "") + (data as any).content,
        }));
      } else if (data.type === "output_update") {
        const update = data as OutputUpdate;
        if (update.output_type === "string") {
          set((state: any) => ({ chunks: (state.chunks || "") + update.value }));
        } else if (["image", "audio", "video"].includes(update.output_type)) {
          const message: Message = {
            role: "assistant",
            type: "message",
            content: [
              makeMessageContent(
                update.output_type,
                (update.value as { data: Uint8Array }).data
              ),
            ],
            workflow_id: get().workflowId,
            name: "assistant",
          } as Message;
          set({ messages: [...get().messages, message] });
        }
      } else if (data.type === "tool_call_update") {
        const update = data as ToolCallUpdate;
        set({ statusMessage: update.message });
      } else if (data.type === "node_progress") {
        const progress = data as NodeProgress;
        if ((progress as any).chunk) {
          set((state: any) => ({
            status: "loading",
            chunks: (state.chunks || "") + (progress as any).chunk,
          }));
        } else {
          set({
            status: "loading",
            progress: { current: progress.progress, total: progress.total },
          });
        }
      }
    };

    socket.onerror = () => {
      set({ error: "WebSocket connection error" });
    };

    socket.onclose = () => {
      set({ status: "disconnected" });
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
      set({ socket: null, status: "disconnected" });
    }
  },

  sendMessage: async (message: Message) => {
    const { socket } = get();
    if (!socket) {
      throw new Error("WebSocket connection not established");
    }
    message.workflow_id = get().workflowId || undefined;
    set((state) => ({ messages: [...state.messages, message], status: "loading" }));
    socket.send(encode(message));
  },

  resetMessages: () => set({ messages: [], chunks: "" }),
}));

export default useGlobalChatStore;
