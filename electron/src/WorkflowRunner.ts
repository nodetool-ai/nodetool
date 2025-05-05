import { encode, decode } from "@msgpack/msgpack";
import { create } from "zustand";
// @ts-expect-error types not available
import WebSocket from "ws";
import { Notification } from "electron";
import { Workflow } from "./types";

const WORKER_URL = "ws://127.0.0.1:8000/predict";

interface WorkflowRunnerState {
  workflow: Workflow | null;
  socket: WebSocket | null;
  state: "idle" | "connecting" | "connected" | "running" | "error";
  progress: { current: number; total: number } | null;
  chunks: string[];
  results: any[];
  error: Error | null;
  statusMessage: string | null;
  jobId: string | null;
  notifications: {
    type: "error" | "info";
    content: string;
    id: string;
  }[];

  /** Actions */

  /**
   * Establishes a WebSocket connection to the worker server
   * @returns Promise that resolves when connection is established
   * @throws Error if connection fails
   */
  connect: () => Promise<void>;

  /**
   * Callback function executed when workflow execution completes
   * @param results Array of workflow execution results
   */
  onComplete: (results: any[]) => void;

  /**
   * Runs a workflow with the specified parameters
   * @param workflow The workflow configuration to execute
   * @param params Key-value pairs of workflow parameters
   * @returns Promise that resolves with the workflow results
   * @throws Error if WebSocket is not connected
   */
  run: (workflow: Workflow, params: Record<string, any>) => Promise<any>;

  /**
   * Closes the WebSocket connection and resets state
   */
  disconnect: () => void;

  /**
   * Adds a notification to the state and shows a native OS notification
   * @param notification Object containing notification type and content
   * @param notification.type Type of notification ('error' or 'info')
   * @param notification.content Text content of the notification
   */
  addNotification: (notification: {
    type: "error" | "info";
    content: string;
  }) => void;

  /**
   * Removes a notification from state by its ID
   * @param id Unique identifier of the notification to remove
   */
  removeNotification: (id: string) => void;
}

export const createWorkflowRunner = () =>
  create<WorkflowRunnerState>((set, get) => ({
    socket: null,
    state: "idle",
    workflow: null,
    progress: null,
    chunks: [],
    onComplete: () => {},
    error: null,
    nodeUpdate: null,
    jobUpdate: null,
    statusMessage: null,
    jobId: null,
    results: [],
    notifications: [],
    connect: async () => {
      return new Promise((resolve, reject) => {
        // Use the global WebSocket without any special options
        const socket = new WebSocket(WORKER_URL);

        socket.on("open", () => {
          console.log("WebSocket connected");
          set({ socket, state: "connected" });
          resolve();
        });

        socket.on("error", (error: Error) => {
          set({
            state: "error",
            error: new Error("WebSocket connection failed"),
          });
          reject(error);
        });

        socket.on("message", async (event: WebSocket.Data) => {
          const data = decode(
            event instanceof Buffer ? event : new Uint8Array(event)
          ) as any;
          if (data.type !== "chunk") {
            console.log("data", data);
          }

          if (data.type === "node_update") {
            set({
              statusMessage: `${data.node_name} ${data.status}`,
            });
          }

          if (data.type === "job_update") {
            set({
              state:
                data.status === "running" || data.status === "queued"
                  ? "running"
                  : "idle",
              statusMessage: `Job ${data.status}`,
            });

            get().addNotification({
              type: "info",
              content: `${get().workflow?.name} ${data.status}`,
            });

            if (data.job_id) {
              set({ jobId: data.job_id });
            }

            switch (data.status) {
              case "completed":
                get().addNotification({
                  type: "info",
                  content: `Workflow ${get().workflow?.name} completed`,
                });
                set({ statusMessage: "Job completed" });
                get().disconnect();
                get().onComplete(get().results);
                break;
              case "failed":
                {
                  const error = new Error(data.error);
                  set({ error });
                  get().addNotification({
                    type: "error",
                    content: `Workflow ${get().workflow?.name} failed: ${
                      data.error
                    }`,
                  });
                  get().disconnect();
                }
                break;
            }
          } else if (data.type === "node_progress") {
            set({
              progress: { current: data.progress, total: data.total },
            });
          } else if (data.type === "chunk") {
            set({ chunks: [...get().chunks, data.content] });
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
        });

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

    run: async (workflow: Workflow, params: Record<string, any>) => {
      if (!get().socket || get().state !== "connected") {
        await get().connect();
      }

      set({
        chunks: [],
        results: [],
        progress: null,
        statusMessage: null,
        notifications: [],
        workflow: workflow,
      });

      const request = {
        type: "run_job_request",
        workflow_id: workflow.id,
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

      get().addNotification({
        type: "info",
        content: `Running ${workflow.name}`,
      });
    },

    addNotification: (notification) => {
      const id = Math.random().toString(36).substr(2, 9);
      const notificationWithId = { ...notification, id };

      // Create native Electron notification with more options
      new Notification({
        title: "Nodetool",
        body: notification.content,
        silent: false,
        urgency: notification.type === "error" ? "critical" : "normal",
      }).show();

      set({ notifications: [...get().notifications, notificationWithId] });
    },

    removeNotification: (id) => {
      set({
        notifications: get().notifications.filter((n) => n.id !== id),
      });
    },
  }));
