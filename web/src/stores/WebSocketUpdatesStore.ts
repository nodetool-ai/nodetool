import { create, StoreApi, UseBoundStore } from "zustand";
import { SystemStats, Workflow } from "./ApiTypes";
import { BASE_URL } from "./ApiClient";

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

export const createWebSocketUpdatesStore = (
  onWorkflowUpdate: (workflow: Workflow) => void,
  onWorkflowDelete: (workflowId: string) => void,
  onWorkflowCreate: (workflow: Workflow) => void
) =>
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
            case "update_workflow":
              onWorkflowUpdate(data.workflow);
              break;
            case "delete_workflow":
              onWorkflowDelete(data.id);
              break;
            case "create_workflow":
              onWorkflowCreate(data.workflow);
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
