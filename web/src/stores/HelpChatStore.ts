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
  ToolCallUpdate
} from "./ApiTypes";
import { CHAT_URL, isLocalhost } from "./ApiClient";
import log from "loglevel";
import { decode, encode } from "@msgpack/msgpack";
import { supabase } from "../lib/supabaseClient";

type HelpChatState = {
  socket: WebSocket | null;
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  messages: Message[];
  progressMessage: string | null;
  progress: number;
  total: number;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  addMessages: (messages: Message[]) => void;
  resetMessages: () => void;
};

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

const useHelpChatStore = create<HelpChatState>((set, get) => ({
  socket: null,
  messages: [],
  progressMessage: null,
  status: "disconnected",
  error: null,
  progress: 0,
  total: 0,
  addMessages: (messages: Message[]) => {
    set((state) => ({
      messages: [...state.messages, ...messages]
    }));
  },
  connect: async () => {
    log.info("Connecting to help chat");

    if (get().socket) {
      get().disconnect();
    }

    set({ status: "connecting", error: null });

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

    log.info("Attempting to connect to WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      log.info("Help Chat WebSocket connected");
      set({ socket, status: "connected", error: null });
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
      } else if (data.type === "chunk") {
        const chunk = data as Chunk;
        const messages = get().messages;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          // Append to the last assistant message
          const updatedMessage: Message = {
            ...lastMessage,
            // Ensure content is treated as a string and concatenated
            content: (lastMessage.content || "") + chunk.content
          };
          set({ messages: [...messages.slice(0, -1), updatedMessage] });
        } else {
          // Create a new assistant message
          const message: Message = {
            role: "assistant" as const,
            type: "message" as const,
            content: chunk.content
          };
          set({ messages: [...messages, message] });
        }
        if (chunk.done) {
          set({ status: "connected" });
        }
      } else {
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
                console.log(get().messages);
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
                content: update.value as string
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
              ]
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
    };

    socket.onerror = (error) => {
      log.error("Help Chat WebSocket error:", error);
      set({
        status: "error",
        error:
          "Connection failed." +
          (!isLocalhost ? " This may be due to an authentication issue." : "")
      });
    };

    socket.onclose = (event) => {
      log.info("Help Chat WebSocket disconnected", {
        code: event.code,
        reason: event.reason
      });
      set({
        socket: null,
        status: "disconnected",
        error: event.reason || "Connection closed"
      });
    };

    set({ socket });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Connection timeout"));
      }, 10000); // 10 second timeout

      const interval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          clearTimeout(timeout);
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

export default useHelpChatStore;
