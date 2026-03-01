import { create } from "zustand";
import { DOWNLOAD_URL } from "./BASE_URL";
import { BASE_URL } from "./BASE_URL";
import { QueryClient } from "@tanstack/react-query";
import { useHfCacheStatusStore } from "./HfCacheStatusStore";
import log from "loglevel";

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
  abortController?: AbortController;
  modelType?: string;
  lastUpdated?: number; // Timestamp of last progress update
}

interface ModelDownloadStore {
  downloads: Record<string, Download>;
  ws: WebSocket | null;
  wsConnectionState: "disconnected" | "connecting" | "connected";
  reconnectAttempts: number;
  queryClient: QueryClient | null;
  setQueryClient: (queryClient: QueryClient) => void;
  connectWebSocket: () => Promise<WebSocket>;
  disconnectWebSocket: () => void;
  reconnectWebSocket: () => void;
  hasActiveDownloads: () => boolean;
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

// Reconnection settings
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000; // Start with 2 seconds, then exponential backoff
const LLAMA_CPP_MODEL_TYPES = new Set(["llama_cpp_model", "llama_cpp", "hf.gguf"]);

const calculateSpeed = (speedHistory: SpeedDataPoint[]): number | null => {
  if (speedHistory.length < 2) {return null;}
  const oldestPoint = speedHistory[0];
  const newestPoint = speedHistory[speedHistory.length - 1];
  const bytesDiff = newestPoint.bytes - oldestPoint.bytes;
  const timeDiff = newestPoint.timestamp - oldestPoint.timestamp;
  return timeDiff > 0 ? (bytesDiff / timeDiff) * 1000 : null;
};

export const useModelDownloadStore = create<ModelDownloadStore>((set, get) => ({
  downloads: {},
  ws: null,
  wsConnectionState: "disconnected",
  reconnectAttempts: 0,
  queryClient: null,
  setQueryClient: (queryClient: QueryClient) => {
    set({ queryClient });
  },

  hasActiveDownloads: () => {
    const downloads = get().downloads;
    return Object.values(downloads).some(
      (d) =>
        d.status === "running" ||
        d.status === "progress" ||
        d.status === "start" ||
        d.status === "pending"
    );
  },

  reconnectWebSocket: () => {
    const { reconnectAttempts, hasActiveDownloads, wsConnectionState } = get();

    // Only reconnect if we have active downloads and aren't already connecting
    if (!hasActiveDownloads() || wsConnectionState === "connecting") {
      return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        "[ModelDownloadStore] Max reconnect attempts reached. Giving up."
      );
      // Mark active downloads as potentially stalled/errored
      const downloads = get().downloads;
      Object.entries(downloads).forEach(([id, download]) => {
        if (
          download.status === "running" ||
          download.status === "progress" ||
          download.status === "start"
        ) {
          get().updateDownload(id, {
            message: "Connection lost. Download may still be running on server."
          });
        }
      });
      return;
    }

    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts);

    set({ reconnectAttempts: reconnectAttempts + 1 });

    setTimeout(() => {
      get()
        .connectWebSocket()
        .then(() => {
          set({ reconnectAttempts: 0 });
        })
        .catch(() => {
          get().reconnectWebSocket();
        });
    }, delay);
  },

  connectWebSocket: async () => {
    let ws = get().ws;
    if (ws?.readyState === WebSocket.OPEN) {
      return ws;
    }

    // Prevent multiple simultaneous connection attempts
    if (get().wsConnectionState === "connecting") {
      // Wait for existing connection attempt with timeout to prevent memory leak
      const CONNECTION_TIMEOUT_MS = 30000; // 30 second timeout
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          const currentWs = get().ws;
          const state = get().wsConnectionState;
          if (state === "connected" && currentWs) {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            resolve(currentWs);
          } else if (state === "disconnected") {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            reject(new Error("Connection failed"));
          }
        }, 100);

        // Add timeout to prevent interval from running forever
        const timeoutId = setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`));
        }, CONNECTION_TIMEOUT_MS);
      });
    }

    set({ wsConnectionState: "connecting" });
    ws = new WebSocket(DOWNLOAD_URL);

    await new Promise<void>((resolve, reject) => {
      if (ws) {
        ws.onopen = () => {
          set({ wsConnectionState: "connected" });
          resolve();
        };
        ws.onerror = (error) => {
          set({ wsConnectionState: "disconnected" });
          reject(error);
        };
      } else {
        set({ wsConnectionState: "disconnected" });
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
            id,
            modelType: data.model_type,
            downloadedBytes: data.downloaded_bytes ?? 0,
            totalBytes: data.total_bytes ?? 0,
            totalFiles: data.total_files ?? 0,
            downloadedFiles: data.downloaded_files ?? 0,
            currentFiles: data.current_files,
            message: data.error || data.message
          });
          if (data.status === "completed") {
            const queryClient = get().queryClient;
            queryClient?.invalidateQueries({ queryKey: ["allModels"] });
            queryClient?.invalidateQueries({ queryKey: ["image-models"] });
            useHfCacheStatusStore.getState().invalidate([id]);

            // Restart llama-server if a llama_cpp model was downloaded
            const download = get().downloads[id];
            if (
              download?.modelType &&
              LLAMA_CPP_MODEL_TYPES.has(download.modelType) &&
              window.api?.restartLlamaServer
            ) {
              window.api.restartLlamaServer().catch((e: unknown) => {
                log.error("Failed to restart llama-server:", e);
              });
            }
          }
        }
      };

      ws.onclose = (event) => {
        console.warn(
          `[ModelDownloadStore] WebSocket closed: code=${event.code}, reason=${event.reason}`
        );
        set({ ws: null, wsConnectionState: "disconnected" });

        // Attempt reconnection if we have active downloads
        if (get().hasActiveDownloads()) {
          get().reconnectWebSocket();
        }
      };

      ws.onerror = (error) => {
        console.error("[ModelDownloadStore] WebSocket error:", error);
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
      set({ ws: null, wsConnectionState: "disconnected", reconnectAttempts: 0 });
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
      const currentDownload =
        state.downloads[id] ||
        ({
          status: "pending",
          downloadedBytes: 0,
          totalBytes: 0,
          totalFiles: 0,
          downloadedFiles: 0,
          id,
          speed: null,
          speedHistory: [],
          currentFiles: []
        } as Download);

      const nextDownloadedBytes =
        update.downloadedBytes ?? currentDownload.downloadedBytes;
      const nextTotalBytes = update.totalBytes ?? currentDownload.totalBytes;
      const nextDownloadedFiles =
        update.downloadedFiles ?? currentDownload.downloadedFiles ?? 0;
      const nextTotalFiles =
        update.totalFiles ?? currentDownload.totalFiles ?? 0;
      const nextStatusRaw = update.status ?? currentDownload.status;

      const incompleteBytes =
        nextStatusRaw === "completed" &&
        nextTotalBytes > 0 &&
        nextDownloadedBytes < nextTotalBytes;
      const incompleteFiles =
        nextStatusRaw === "completed" &&
        nextTotalFiles > 0 &&
        nextDownloadedFiles < nextTotalFiles;
      const nextStatus =
        nextStatusRaw === "completed" && (incompleteBytes || incompleteFiles)
          ? "progress"
          : nextStatusRaw;

      const newSpeedHistory = [
        ...currentDownload.speedHistory,
        {
          bytes: nextDownloadedBytes,
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
            downloadedBytes: nextDownloadedBytes,
            totalBytes: nextTotalBytes,
            downloadedFiles: nextDownloadedFiles,
            totalFiles: nextTotalFiles,
            status: nextStatus,
            speedHistory: newSpeedHistory,
            speed: newSpeed,
            lastUpdated: Date.now()
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

    const additionalProps: Partial<Download> = {
      modelType: modelType
    };
    let abortController: AbortController | undefined;

    if (modelType === "llama_model") {
      abortController = new AbortController();
      additionalProps.abortController = abortController;
    }

    get().addDownload(id, additionalProps);

    if (modelType === "llama_model") {
      try {
        const response = await fetch(
          `${BASE_URL}/api/models/pull_ollama_model?model_name=${encodeURIComponent(id)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            signal: abortController?.signal
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
          if (done) {break;}

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
        const queryClient = get().queryClient;
        queryClient?.invalidateQueries({ queryKey: ["allModels"] });
        queryClient?.invalidateQueries({ queryKey: ["image-models"] });
      } catch (error) {
        const aborted =
          (error instanceof DOMException && error.name === "AbortError") ||
          (error as { name?: string }).name === "AbortError";
        if (aborted) {
          get().updateDownload(id, { status: "cancelled" });
        } else {
          get().updateDownload(id, { status: "error" });
        }
      } finally {
        get().updateDownload(id, { abortController: undefined });
      }
    } else {
      const ws = await get().connectWebSocket();
      ws.send(
        JSON.stringify({
          command: "start_download",
          repo_id: repoId,
          path: path,
          allow_patterns: allowPatterns,
          ignore_patterns: ignorePatterns,
          model_type: modelType
        })
      );
    }
  },

  cancelDownload: async (id) => {
    const download = get().downloads[id];
    if (download?.abortController) {
      download.abortController.abort();
      get().updateDownload(id, { status: "cancelled" });
      return;
    }

    const ws = await get().connectWebSocket();
    ws.send(JSON.stringify({ command: "cancel_download", id: id }));
    get().updateDownload(id, { status: "cancelled" });
  },

  isDialogOpen: false,

  openDialog: () => set({ isDialogOpen: true }),

  closeDialog: () => set({ isDialogOpen: false })
}));
