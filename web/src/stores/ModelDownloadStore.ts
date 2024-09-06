import { create } from "zustand";
import useModelStore from "./ModelStore";
import axios, { CancelTokenSource } from 'axios';

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
    id: string,
    modelType: string,
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

    ws = new WebSocket("ws://localhost:8000/hf/download");

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
        console.log("data", data);
        if (data.repo_id) {
          get().updateDownload(data.repo_id, {
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

  addDownload: (id: string, additionalProps?: Partial<Download>) =>
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
          ...additionalProps,
        } as Download
      }
    })),

  updateDownload: (id: string, update: Partial<Download>) =>
    set((state) => {
      const currentDownload = state.downloads[id];
      if (!currentDownload) return state;

      const newSpeedHistory = [
        ...currentDownload.speedHistory,
        { bytes: update.downloadedBytes || currentDownload.downloadedBytes, timestamp: Date.now() }
      ].slice(-10);  // Keep only the last 10 data points

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
    id: string,
    modelType: string,
    allowPatterns?: string[] | null,
    ignorePatterns?: string[] | null
  ) => {
    const cancelTokenSource = axios.CancelToken.source();
    get().addDownload(id, { cancelTokenSource });
    if (modelType.startsWith("hf.")) {
      const ws = await get().connectWebSocket();
      get().addDownload(id);
      ws.send(
        JSON.stringify({
          command: "start_download",
          repo_id: id,
          allow_patterns: allowPatterns,
          ignore_patterns: ignorePatterns
        })
      );
    } else if (modelType === 'llama_model') {
      try {
        const response = await axios.post('http://localhost:11434/api/pull', {
          name: id,
          stream: true,
        }, {
          responseType: 'stream',
          cancelToken: cancelTokenSource.token,
        });

        response.data.on('data', (chunk: Buffer) => {
          const data = JSON.parse(chunk.toString());
          get().updateDownload(id, {
            status: data.status === "success" ? "completed" : "running",
            message: data.status,
            downloadedBytes: data.completed || 0,
            totalBytes: data.total || 0,
          });
        });

        response.data.on('end', () => {
          get().updateDownload(id, { status: "completed" });
          useModelStore.getState().invalidate();
        });

        response.data.on('error', (error: Error) => {
          if (axios.isCancel(error)) {
            get().updateDownload(id, { status: "cancelled" });
          } else {
            get().updateDownload(id, { status: "error" });
          }
        });
      } catch (error) {
        if (axios.isCancel(error)) {
          get().updateDownload(id, { status: "cancelled" });
        } else {
          get().updateDownload(id, { status: "error", message: "Failed to start download" });
        }
      }
    }
  },

  cancelDownload: async (id) => {
    const download = get().downloads[id];
    if (download && download.cancelTokenSource) {
      download.cancelTokenSource.cancel('Download cancelled by user');
      get().updateDownload(id, { status: "cancelled" });
    } else {
      const ws = await get().connectWebSocket();
      ws.send(JSON.stringify({ command: "cancel_download", repo_id: id }));
    }
  },

  isDialogOpen: false,

  openDialog: () => set({ isDialogOpen: true }),

  closeDialog: () => set({ isDialogOpen: false })
}));