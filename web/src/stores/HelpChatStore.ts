import { create } from "zustand";
import { Chunk, Message, MessageContent } from "./ApiTypes";
import { CHAT_URL, isLocalhost } from "./ApiClient";
import log from "loglevel";
import { decode, encode } from "@msgpack/msgpack";
import { supabase } from "../lib/supabaseClient";

type HelpChatState = {
  socket: WebSocket | null;
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  messages: Message[];
  chunks: string;
  progressMessage: string;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: Message) => Promise<void>;
  resetMessages: () => void;
};

export type MsgpackData = Message | Chunk;

const useHelpChatStore = create<HelpChatState>((set, get) => ({
  socket: null,
  messages: [],
  chunks: "",
  status: "disconnected",
  error: null,
  progressMessage: "",
  connect: async () => {
    log.info("Connecting to help chat");

    if (get().socket) {
      get().disconnect();
    }

    set({ status: "connecting" });

    const createMessageFromChunks = () => {
      const chunks = get().chunks;
      const message = {
        role: "assistant",
        type: "message",
        content: chunks
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
      log.info("Help Chat WebSocket connected");
      set({ socket, status: "connected" });
    };

    socket.onmessage = async (event) => {
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;

      console.log(data);

      if (data.type === "message") {
        set((state) => ({
          messages: [...state.messages, data as Message],
          status: "connected"
        }));
      } else if (data.type === "chunk") {
        const chunk = data as Chunk;
        const currentChunk = get().chunks;
        set({ chunks: currentChunk + chunk.content, status: "connected" });
        if (chunk.done) {
          createMessageFromChunks();
        }
      } else {
        // Handle other relevant message types for help chat if any in the future
        log.warn("Received unknown message type for help chat:", data.type);
      }
    };

    socket.onerror = (error) => {
      log.error("Help Chat WebSocket error:", error);
      if (!isLocalhost) {
        set({
          status: "error",
          error:
            "Connection failed. This may be due to an authentication issue."
        });
      }
    };

    socket.onclose = () => {
      log.info("Help Chat WebSocket disconnected");
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

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      set({
        status: "error",
        error: "Connection failed. Please try again."
      });
      console.error("Connection failed. Please try again.");
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
