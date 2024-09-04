import { create } from "zustand";

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
  repoId: string;
  downloadedBytes: number;
  totalBytes: number;
  totalFiles?: number;
  downloadedFiles?: number;
  currentFile?: string;
  message?: string;
}

interface HuggingFaceStore {
  downloads: Record<string, Download>;
  ws: WebSocket | null;
  connectWebSocket: () => Promise<WebSocket>;
  disconnectWebSocket: () => void;
  addDownload: (repoId: string) => void;
  updateDownload: (repoId: string, update: Partial<Download>) => void;
  removeDownload: (repoId: string) => void;
  startDownload: (
    repoId: string,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => void;
  cancelDownload: (repoId: string) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

export const useHuggingFaceStore = create<HuggingFaceStore>((set, get) => ({
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
        if (data.repo_id) {
          get().updateDownload(data.repo_id, {
            status: data.status,
            repoId: data.repo_id,
            downloadedBytes: data.downloaded_bytes,
            totalBytes: data.total_bytes,
            totalFiles: data.total_files,
            downloadedFiles: data.downloaded_files,
            currentFile: data.current_file,
            message: data.message
          });
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

  addDownload: (repoId) =>
    set((state) => ({
      downloads: {
        ...state.downloads,
        [repoId]: {
          status: "pending",
          repoId,
          downloadedBytes: 0,
          totalBytes: 0
        }
      }
    })),

  updateDownload: (repoId, update) =>
    set((state) => ({
      downloads: {
        ...state.downloads,
        [repoId]: {
          ...state.downloads[repoId],
          ...update
        }
      }
    })),

  removeDownload: (repoId) =>
    set((state) => {
      const { [repoId]: _, ...rest } = state.downloads;
      return { downloads: rest };
    }),

  startDownload: async (
    repoId: string,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => {
    const ws = await get().connectWebSocket();
    get().addDownload(repoId);
    ws.send(
      JSON.stringify({
        command: "start_download",
        repo_id: repoId,
        allow_patterns: allowPatterns,
        ignore_patterns: ignorePatterns
      })
    );
  },

  cancelDownload: async (repoId) => {
    const ws = await get().connectWebSocket();
    ws.send(JSON.stringify({ command: "cancel_download", repo_id: repoId }));
  },

  isDialogOpen: false,

  openDialog: () => set({ isDialogOpen: true }),

  closeDialog: () => set({ isDialogOpen: false })
}));
