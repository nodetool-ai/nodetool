import { create, StoreApi, UseBoundStore } from "zustand";
import { SystemStats } from "./ApiTypes";
import { BASE_URL } from "./BASE_URL";

/**
 * Helper function to get WebSocket URL from BASE_URL.
 * When BASE_URL is empty (local dev), uses current origin with ws protocol.
 */
const getWebSocketUrl = (path: string): string => {
  if (BASE_URL) {
    return BASE_URL.replace(/^http/, "ws") + path;
  }
  // When BASE_URL is empty, use current origin with ws protocol
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${path}`;
  }
  return `ws://localhost:3000${path}`;
};

interface WebSocketUpdatesState {
  systemStats: SystemStats | null;
  socket: WebSocket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}
export type WebSocketUpdatesStore = UseBoundStore<
  StoreApi<WebSocketUpdatesState>
>;

export const createWebSocketUpdatesStore = () =>
  create<WebSocketUpdatesState>((set, get) => ({
    systemStats: null,
    socket: null,
    isConnected: false,
    connect: () => {
      if (get().socket?.readyState === WebSocket.OPEN) {
        return;
      }

      const socket = new WebSocket(getWebSocketUrl("/updates"));

      socket.onopen = () => {
        console.log("WebSocket Updates: Connected");
        set({ isConnected: true });
      };

      socket.onclose = (event) => {
        console.log(
          `WebSocket Updates: Connection closed (code: ${event.code}, reason: ${event.reason})`
        );
        set({ isConnected: false });
        console.log(
          "WebSocket Updates: Attempting to reconnect in 5 seconds..."
        );
        setTimeout(() => get().connect(), 5000);
      };

      socket.onerror = (error) => {
        console.error("WebSocket: Connection error:", error);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "system_stats":
              set({ systemStats: data.stats });
              break;
          }
        } catch (error) {
          console.error("WebSocket Updates: Error processing message:", error);
        }
      };

      set({ socket });
    },

    disconnect: () => {
      const { socket } = get();
      if (socket) {
        socket.close();
        set({ socket: null, isConnected: false });
      }
    }
  }));
