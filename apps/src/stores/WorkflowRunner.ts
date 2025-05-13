import { create } from "zustand";
import { encode, decode } from "@msgpack/msgpack";
import {
  Prediction,
  NodeProgress,
  NodeUpdate,
  JobUpdate,
  RunJobRequest,
  WorkflowAttributes,
  TaskUpdate,
  Chunk,
  PlanningUpdate,
  OutputUpdate,
} from "../types/workflow";

const WORKER_URL = "ws://127.0.0.1:8000/predict";

type MsgpackData =
  | Chunk
  | JobUpdate
  | Prediction
  | NodeProgress
  | NodeUpdate
  | TaskUpdate
  | PlanningUpdate
  | OutputUpdate;

interface WorkflowRunnerState {
  socket: WebSocket | null;
  workflow: WorkflowAttributes | null;
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "running"
    | "error"
    | "cancelled";
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
  current_url: string;

  // Actions
  connect: (url: string) => Promise<void>;
  run: (workflowId: string, params: Record<string, any>) => Promise<void>;
  disconnect: () => void;
  addNotification: (notification: {
    type: "error" | "info";
    content: string;
  }) => void;
  removeNotification: (id: string) => void;
  setStatusMessage: (message: string | null) => void;
}

export const useWorkflowRunner = create<WorkflowRunnerState>((set, get) => ({
  socket: null,
  workflow: null,
  state: "idle",
  progress: null,
  chunks: [],
  error: null,
  statusMessage: null,
  jobId: null,
  results: [],
  notifications: [],
  current_url: "",

  setStatusMessage: (message: string | null) => {
    set({ statusMessage: message });
  },

  connect: async (url: string) => {
    if (get().socket) {
      get().disconnect();
    }

    set({ current_url: url, state: "connecting" });

    const socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("WebSocket connected");
      set({ socket, state: "connected" });
    };

    socket.onmessage = async (event) => {
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;
      if (data.type !== "chunk") {
        console.log("data", data);
      }

      if (data.type === "job_update") {
        const job = data as JobUpdate;
        set({
          state:
            job.status === "running" || job.status === "queued"
              ? "running"
              : "idle",
          statusMessage: `Job ${job.status}`,
        });

        if (job.job_id) {
          set({ jobId: job.job_id });
        }

        switch (job.status) {
          case "completed":
            get().addNotification({
              type: "info",
              content: "Job completed",
            });
            set({ statusMessage: "Job completed" });
            get().disconnect();
            break;
          case "failed":
            {
              const error = new Error(job.error || "Unknown error");
              set({ error });
              get().addNotification({
                type: "error",
                content: `Job failed: ${job.error}`,
              });
              get().disconnect();
            }
            break;
          case "queued":
            set({
              statusMessage: "Worker is booting (may take a 15 seconds)...",
            });
            break;
          case "running":
            if (job.message) {
              get().addNotification({
                type: "info",
                content: job.message,
              });
            }
            break;
        }
      } else if (data.type === "node_progress") {
        const progress = data as NodeProgress;
        set({
          progress: { current: progress.progress, total: progress.total },
        });
      } else if (data.type === "chunk") {
        const chunk = data as Chunk;
        set({ chunks: [...get().chunks, chunk.content] });
      } else if (data.type === "node_update") {
        const update = data as NodeUpdate;
        if (update.error) {
          set({ state: "error" });
          get().addNotification({
            type: "error",
            content: update.error,
          });
        } else if (update.node_name) {
          set({
            statusMessage: `${update.node_name} ${update.status}`,
          });
        }
      } else if (data.type === "output_update") {
        const output = data as OutputUpdate;
        set({
          results: [...get().results, output.value],
        });
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      set({ state: "error" });
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
      set({ socket: null, state: "idle" });
    };

    set({ socket });

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          set({ state: "connected" });
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
      set({ socket: null, current_url: "", state: "idle" });
    }
  },

  run: async (workflowId: string, params: Record<string, any>) => {
    if (!get().socket || get().state !== "connected") {
      await get().connect(WORKER_URL);
    }

    set({
      chunks: [],
      results: [],
      progress: null,
      statusMessage: null,
      notifications: [],
    });

    const request: RunJobRequest = {
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
