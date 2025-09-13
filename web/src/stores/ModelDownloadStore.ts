import { create } from "zustand";
import useModelStore from "./ModelStore";
import axios, { CancelTokenSource } from "axios";
import { DOWNLOAD_URL } from "./BASE_URL";
import { BASE_URL } from "./BASE_URL";

interface SpeedDataPoint {
  bytes: number;
  timestamp: number;
}

interface Download {
  status:
    | "pending"
    | "idle"
    | "running"
    | "completed"
    | "cancelled"
    | "error"
    | "start"
    | "progress";
  id: string;
  downloadedBytes: number;
  totalBytes: number;
  totalFiles?: number;
  downloadedFiles?: number;
  currentFiles?: string[];
  message?: string;
  speed: number | null;
  speedHistory: SpeedDataPoint[];
  cancelTokenSource?: CancelTokenSource;
}

interface ModelDownloadStore {
  downloads: Record<string, Download>;
  ws: WebSocket | null;
  connectWebSocket: () => Promise<WebSocket>;
  disconnectWebSocket: () => void;
  addDownload: (id: string, additionalProps?: Partial<Download>) => void;
  updateDownload: (id: string, update: Partial<Download>) => void;
  removeDownload: (id: string) => void;
  startDownload: (
    repoId: string,
    modelType: string,
    path?: string | null,
    allowPatterns?: string[] | null,
    ignorePatterns?: string[] | null
  ) => void;
  cancelDownload: (id: string) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const calculateSpeed = (speedHistory: SpeedDataPoint[]): number | null => {
  if (speedHistory.length < 2) return null;
  const oldestPoint = speedHistory[0];
  const newestPoint = speedHistory[speedHistory.length - 1];
  const bytesDiff = newestPoint.bytes - oldestPoint.bytes;
  const timeDiff = newestPoint.timestamp - oldestPoint.timestamp;
  return timeDiff > 0 ? (bytesDiff / timeDiff) * 1000 : null;
};

export const useModelDownloadStore = create<ModelDownloadStore>((set, get) => ({
  downloads: {},
  ws: null,

  connectWebSocket: async () => {
    let ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      return ws;
    }

    ws = new WebSocket(DOWNLOAD_URL);

    await new Promise<void>((resolve, reject) => {
      if (ws) {
        ws.onopen = () => resolve();
        ws.onerror = (error) => reject(error);
      } else {
        reject(new Error("WebSocket is null"));
      }
    });

    if (ws) {
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.repo_id) {
          const id = data.path ? data.repo_id + "/" + data.path : data.repo_id;
          get().updateDownload(id, {
            status: data.status,
            id: data.repo_id,
            downloadedBytes: data.downloaded_bytes,
            totalBytes: data.total_bytes,
            totalFiles: data.total_files,
            downloadedFiles: data.downloaded_files,
            currentFiles: data.current_files,
            message: data.message
          });
          if (data.status === "completed") {
            useModelStore.getState().invalidate();
          }
        }
      };

      set({ ws });
      return ws;
    } else {
      throw new Error("WebSocket connection failed");
    }
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
  },

  addDownload: (id: string, additionalProps?: Partial<Download>) => {
    set((state) => ({
      downloads: {
        ...state.downloads,
        [id]: {
          status: "pending",
          downloadedBytes: 0,
          totalBytes: 0,
          id: id,
          speed: null,
          speedHistory: [],
          ...additionalProps
        } as Download
      }
    }));
  },

  updateDownload: (id: string, update: Partial<Download>) =>
    set((state) => {
      const currentDownload = state.downloads[id];
      if (!currentDownload) return state;

      const newSpeedHistory = [
        ...currentDownload.speedHistory,
        {
          bytes: update.downloadedBytes || currentDownload.downloadedBytes,
          timestamp: Date.now()
        }
      ].slice(-10); // Keep only the last 10 data points

      const newSpeed = calculateSpeed(newSpeedHistory);

      return {
        downloads: {
          ...state.downloads,
          [id]: {
            ...currentDownload,
            ...update,
            speedHistory: newSpeedHistory,
            speed: newSpeed
          }
        }
      };
    }),

  removeDownload: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.downloads;
      return { downloads: rest };
    }),

  startDownload: async (
    repoId: string,
    modelType: string,
    path?: string | null,
    allowPatterns?: string[] | null,
    ignorePatterns?: string[] | null
  ) => {
    if (path) {
      if (allowPatterns) {
        throw new Error("allowPatterns is not supported when path is provided");
      }
      if (ignorePatterns) {
        throw new Error(
          "ignorePatterns is not supported when path is provided"
        );
      }
      allowPatterns = [path];
      ignorePatterns = [];
    }
    const id = path ? repoId + "/" + path : repoId;

    get().addDownload(id);

    if (modelType.startsWith("hf.")) {
      const ws = await get().connectWebSocket();
      ws.send(
        JSON.stringify({
          command: "start_download",
          repo_id: repoId,
          path: path,
          allow_patterns: allowPatterns,
          ignore_patterns: ignorePatterns
        })
      );
    } else if (modelType === "llama_model") {
      try {
        const response = await fetch(
          BASE_URL + "/api/models/pull_ollama_model?model_name=" + id,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            }
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = (await reader?.read()) || {
            done: true,
            value: undefined
          };
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            const data = JSON.parse(line);
            get().updateDownload(id, {
              status: data.status === "success" ? "completed" : "running",
              message: data.status,
              downloadedBytes: data.completed || 0,
              totalBytes: data.total || 0
            });
          }
        }

        get().updateDownload(id, { status: "completed" });
        useModelStore.getState().invalidate();
      } catch (error) {
        if (axios.isCancel(error)) {
          get().updateDownload(id, { status: "cancelled" });
        } else {
          get().updateDownload(id, { status: "error" });
        }
      }
    }
  },

  cancelDownload: async (id) => {
    const ws = await get().connectWebSocket();
    ws.send(JSON.stringify({ command: "cancel_download", id: id }));
    get().updateDownload(id, { status: "cancelled" });
  },

  isDialogOpen: false,

  openDialog: () => set({ isDialogOpen: true }),

  closeDialog: () => set({ isDialogOpen: false })
}));
