import { create } from "zustand";
import { DOWNLOAD_URL } from "./BASE_URL";
import { QueryClient } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { useHfCacheStatusStore } from "./HfCacheStatusStore";
import { MODEL_QUERY_KEYS } from "./resourceChangeHandler";

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
  /** In-flight connect promise; concurrent callers reuse this. */
  wsConnectingPromise: Promise<WebSocket> | null;
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
  wsConnectingPromise: null,
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
    const existing = get().ws;
    if (existing?.readyState === WebSocket.OPEN) {
      return existing;
    }

    // Reuse the in-flight connect promise so concurrent callers don't
    // open a second socket — the polling/interval pattern in the previous
    // implementation could resolve with a stale `ws` reference.
    const inflight = get().wsConnectingPromise;
    if (inflight) {
      return inflight;
    }

    set({ wsConnectionState: "connecting" });
    const ws = new WebSocket(DOWNLOAD_URL);

    const connectPromise = new Promise<WebSocket>((resolve, reject) => {
      let settled = false;
      const onOpen = () => {
        if (settled) return;
        settled = true;
        set({ ws, wsConnectionState: "connected", wsConnectingPromise: null });
        resolve(ws);
      };
      const onError = (error: Event) => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* already closing */
        }
        set({
          ws: null,
          wsConnectionState: "disconnected",
          wsConnectingPromise: null
        });
        reject(error);
      };
      ws.addEventListener("open", onOpen, { once: true });
      ws.addEventListener("error", onError, { once: true });
    });

    set({ wsConnectingPromise: connectPromise });
    await connectPromise;

    {
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
            // A finished download can produce any modality (LLM GGUF, TTS,
            // diffusion, embedding, …), so invalidate every per-modality
            // picker query plus the aggregated lists. The HuggingFace and
            // Ollama listings also derive from on-disk state and must
            // refresh so newly cached repos flip from "Download" to
            // "Downloaded" immediately.
            for (const key of MODEL_QUERY_KEYS) {
              queryClient?.invalidateQueries({ queryKey: [key] });
            }
            queryClient?.invalidateQueries({ queryKey: ["huggingFaceModels"] });
            queryClient?.invalidateQueries({ queryKey: ["hf-models"] });
            queryClient?.invalidateQueries({ queryKey: ["ollamaModels"] });
            queryClient?.invalidateQueries({ queryKey: ["tjs-models"] });
            queryClient?.invalidateQueries({ queryKey: ["tjs-recommended"] });
            useHfCacheStatusStore.getState().invalidate([id]);

            // Restart llama-server if a llama_cpp model was downloaded
            const download = get().downloads[id];
            if (
              download?.modelType &&
              LLAMA_CPP_MODEL_TYPES.has(download.modelType) &&
              window.api?.restartLlamaServer
            ) {
              window.api.restartLlamaServer().catch((e: unknown) => {
                console.error("Failed to restart llama-server:", e);
              });
            }
          }
        }
      };

      ws.onclose = (event) => {
        console.warn(
          `[ModelDownloadStore] WebSocket closed: code=${event.code}, reason=${event.reason}`
        );
        set({
          ws: null,
          wsConnectionState: "disconnected",
          wsConnectingPromise: null
        });

        // Attempt reconnection if we have active downloads
        if (get().hasActiveDownloads()) {
          get().reconnectWebSocket();
        }
      };

      ws.onerror = (error) => {
        console.error("[ModelDownloadStore] WebSocket error:", error);
      };

      // ws is already stored via the open handler in connectPromise.
      return ws;
    }
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({
        ws: null,
        wsConnectionState: "disconnected",
        reconnectAttempts: 0,
        wsConnectingPromise: null
      });
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

    get().addDownload(id, additionalProps);

    if (modelType === "llama_model") {
      try {
        // Streaming Ollama model pulls are not available in the TS standalone server.
        // The tRPC endpoint returns an unavailable stub; direct Ollama API should be used instead.
        const result = await trpc.models.pullOllamaModel.mutate({ model: id });
        get().updateDownload(id, {
          status: result.status === "unavailable" ? "error" : "completed",
          message: result.message
        });
      } catch {
        get().updateDownload(id, { status: "error" });
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
