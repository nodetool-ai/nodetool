import { encode, decode } from "@msgpack/msgpack";
import type { JobUpdate, NodeUpdate } from "../types/workflow";
import { create } from "zustand";

const WORKER_URL = "ws://127.0.0.1:8000/predict";

interface WorkflowRunnerState {
  socket: WebSocket | null;
  state: "idle" | "connecting" | "connected" | "running" | "error";
  progress: { current: number; total: number } | null;
  chunks: string[];
  results: any[];
  notifications: {
    type: "error" | "info";
    content: string;
    id: string;
  }[];
  error: Error | null;
  statusMessage: string | null;
  jobId: string | null;

  // Actions
  connect: () => Promise<void>;
  run: (workflowId: string, params: Record<string, any>) => Promise<any>;
  disconnect: () => void;
  addNotification: (notification: {
    type: "error" | "info";
    content: string;
  }) => void;
  removeNotification: (id: string) => void;
}

export const useWorkflowRunner = create<WorkflowRunnerState>((set, get) => ({
  socket: null,
  state: "idle",
  progress: null,
  chunks: [],
  error: null,
  nodeUpdate: null,
  jobUpdate: null,
  statusMessage: null,
  jobId: null,
  results: [],
  notifications: [],
  connect: async () => {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(WORKER_URL);

      socket.onopen = () => {
        console.log("WebSocket connected");
        set({ socket, state: "connected" });
        resolve();
      };

      socket.onerror = (error) => {
        set({
          state: "error",
          error: new Error("WebSocket connection failed"),
        });
        reject(error);
      };

      socket.onmessage = async (event) => {
        const arrayBuffer = await event.data.arrayBuffer();
        const data = decode(new Uint8Array(arrayBuffer)) as any;
        console.log("data", data);

        if (data.type === "job_update") {
          set({
            state:
              data.status === "running" || data.status === "queued"
                ? "running"
                : "idle",
            statusMessage: `Job ${data.status}`,
          });

          if (data.job_id) {
            set({ jobId: data.job_id });
          }

          switch (data.status) {
            case "completed":
              get().addNotification({
                type: "info",
                content: "Job completed",
              });
              set({ statusMessage: "Job completed" });
              get().disconnect();
              break;
            case "failed":
              const error = new Error(data.error);
              set({ error });
              get().addNotification({
                type: "error",
                content: `Job failed: ${data.error}`,
              });
              get().disconnect();
              break;
            case "queued":
              set({
                statusMessage: "Worker is booting (may take a 15 seconds)...",
              });
              break;
            case "running":
              if (data.message) {
                get().addNotification({
                  type: "info",
                  content: data.message,
                });
              }
              break;
          }
        } else if (data.type === "node_progress") {
          set({
            progress: { current: data.progress, total: data.total },
          });
          if (data.chunk) {
            set({ chunks: [...get().chunks, data.chunk] });
          }
        } else if (data.type === "node_update") {
          if (data.error) {
            set({ state: "error" });
            get().addNotification({
              type: "error",
              content: data.error,
            });
          } else if (
            data.result &&
            data.result.output &&
            data.node_name.includes("Output")
          ) {
            set({
              results: [...get().results, data.result.output],
            });
          } else if (data.node_name) {
            set({
              statusMessage: `${data.node_name} ${data.status}`,
            });
          }
        }
      };
      set({ state: "connecting", statusMessage: "Connecting..." });
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, state: "idle" });
    }
  },

  run: async (workflowId: string, params: Record<string, any>) => {
    if (!get().socket || get().state !== "connected") {
      await get().connect();
    }

    set({
      chunks: [],
      results: [],
      progress: null,
      statusMessage: null,
      notifications: [],
    });

    const request = {
      type: "run_job_request",
      workflow_id: workflowId,
      job_type: "workflow",
      auth_token: "local_token",
      params: params,
    };

    set({ state: "running" });

    const socket = get().socket;
    if (!socket) {
      throw new Error("WebSocket not connected");
    }

    socket.send(
      encode({
        command: "run_job",
        data: request,
      })
    );
  },

  addNotification: (notification) => {
    const id = Math.random().toString(36).substr(2, 9);
    const notificationWithId = { ...notification, id };

    set({ notifications: [...get().notifications, notificationWithId] });

    const timeout = notification.type === "error" ? 10000 : 5000;
    setTimeout(() => {
      get().removeNotification(id);
    }, timeout);
  },

  removeNotification: (id) => {
    set({
      notifications: get().notifications.filter((n) => n.id !== id),
    });
  },
}));
