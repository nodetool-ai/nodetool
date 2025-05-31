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

type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error"
  | "reconnecting";

type HelpChatState = {
  socket: WebSocket | null;
  status: ChatStatus;
  messages: Message[];
  progressMessage: string | null;
  progress: number;
  total: number;
  error: string | null;
  
  // Reconnection state
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  isIntentionalDisconnect: boolean;
  reconnectTimeoutId: NodeJS.Timeout | null;
  messageQueue: Message[];
  
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

// Reconnection constants
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BACKOFF_FACTOR = 1.5; // Less aggressive than doubling

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
  
  // Reconnection state
  reconnectAttempts: 0,
  maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectDelay: INITIAL_RECONNECT_DELAY,
  isIntentionalDisconnect: false,
  reconnectTimeoutId: null,
  messageQueue: [],
  addMessages: (messages: Message[]) => {
    set((state) => ({
      messages: [...state.messages, ...messages]
    }));
  },
  connect: async () => {
    log.info("Connecting to help chat");

    // Clear any pending reconnection
    const { reconnectTimeoutId } = get();
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      set({ reconnectTimeoutId: null });
    }

    if (get().socket) {
      get().disconnect();
    }

    // Reset reconnection state on manual connect
    const isReconnecting = get().status === "reconnecting";
    
    set({
      status: isReconnecting ? "reconnecting" : "connecting",
      error: null,
      isIntentionalDisconnect: false,
      // Don't reset attempts if reconnecting
      ...(isReconnecting ? {} : {
        reconnectAttempts: 0,
        reconnectDelay: INITIAL_RECONNECT_DELAY
      })
    });

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
      const state = get();
      
      // Reset reconnection state on successful connection
      set({ 
        socket, 
        status: "connected", 
        error: null,
        progressMessage: null,  // Clear any reconnection message
        reconnectAttempts: 0,
        reconnectDelay: INITIAL_RECONNECT_DELAY
      });

      // Process any queued messages
      if (state.messageQueue.length > 0) {
        log.info(`Processing ${state.messageQueue.length} queued messages`);
        const queue = [...state.messageQueue];
        set({ messageQueue: [] });
        
        // Send queued messages
        queue.forEach(message => {
          get().sendMessage(message).catch(error => {
            log.error("Failed to send queued message:", error);
          });
        });
      }
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
        reason: event.reason,
        wasClean: event.wasClean
      });

      const state = get();
      
      // Check if this was an intentional disconnect
      if (state.isIntentionalDisconnect) {
        set({
          socket: null,
          status: "disconnected",
          error: null
        });
        return;
      }

      // Check if we should attempt reconnection
      const shouldReconnect = 
        !event.wasClean && 
        state.reconnectAttempts < state.maxReconnectAttempts &&
        // Don't reconnect on authentication errors
        event.code !== 1008 && // Policy violation
        event.code !== 4001 && // Unauthorized
        event.code !== 4003;   // Forbidden

      if (shouldReconnect) {
        // Calculate next delay with exponential backoff
        const nextDelay = Math.min(
          state.reconnectDelay * RECONNECT_BACKOFF_FACTOR,
          MAX_RECONNECT_DELAY
        );

        set({
          socket: null,
          status: "reconnecting",
          reconnectAttempts: state.reconnectAttempts + 1,
          reconnectDelay: nextDelay,
          progressMessage: `Reconnecting... (attempt ${state.reconnectAttempts + 1}/${state.maxReconnectAttempts})`,
          error: null
        });

        log.info(`Scheduling reconnection attempt ${state.reconnectAttempts + 1} in ${nextDelay}ms`);

        const timeoutId = setTimeout(() => {
          // Check if we're still supposed to reconnect
          if (!get().isIntentionalDisconnect) {
            get().connect().catch(error => {
              log.error("Reconnection attempt failed:", error);
            });
          }
        }, nextDelay);

        set({ reconnectTimeoutId: timeoutId });
      } else {
        // Max attempts reached or permanent error
        set({
          socket: null,
          status: "disconnected",
          error: event.reason || "Connection closed unexpectedly",
          progressMessage: null
        });
      }
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
    const { socket, reconnectTimeoutId } = get();
    
    // Mark as intentional disconnect
    set({ isIntentionalDisconnect: true });
    
    // Clear any pending reconnection
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      set({ reconnectTimeoutId: null });
    }
    
    if (socket) {
      socket.close();
    }
    
    set({ 
      socket: null, 
      status: "disconnected",
      error: null,
      progressMessage: null,
      reconnectAttempts: 0,
      reconnectDelay: INITIAL_RECONNECT_DELAY
    });
  },

  sendMessage: async (message: Message) => {
    const { socket, status } = get();

    set({ error: null });

    // Handle offline/disconnected state
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      if (status === "reconnecting") {
        // Queue message for later delivery
        log.info("Queueing message while reconnecting");
        set(state => ({
          messageQueue: [...state.messageQueue, message]
        }));
        return;
      } else {
        // Try to reconnect if disconnected
        log.warn("Cannot send message: not connected");
        set({ error: "Not connected to chat service" });
        return;
      }
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

// Network status monitoring
if (typeof window !== "undefined") {
  // Listen for online/offline events
  window.addEventListener("online", () => {
    const state = useHelpChatStore.getState();
    if (state.status === "disconnected" && !state.isIntentionalDisconnect) {
      log.info("Network came online, attempting to reconnect help chat...");
      state.connect().catch(error => {
        log.error("Failed to reconnect help chat after network online:", error);
      });
    }
  });

  window.addEventListener("offline", () => {
    log.info("Network went offline (help chat)");
    // The WebSocket will close automatically, triggering our reconnection logic
  });

  // Visibility change handling - reconnect when tab becomes visible
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const state = useHelpChatStore.getState();
      if (state.status === "disconnected" && !state.isIntentionalDisconnect) {
        log.info("Tab became visible, checking help chat connection...");
        state.connect().catch(error => {
          log.error("Failed to reconnect help chat after tab visible:", error);
        });
      }
    }
  });
}

export default useHelpChatStore;
