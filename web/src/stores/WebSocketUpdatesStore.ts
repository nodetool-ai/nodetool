import { create, StoreApi, UseBoundStore } from "zustand";
import { SystemStats } from "./ApiTypes";
import { BASE_URL } from "./BASE_URL";

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

      const socket = new WebSocket(`${BASE_URL.replace("http", "ws")}/updates`);

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
