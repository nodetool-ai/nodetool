/**
 * RuntimePackagesStore
 *
 * Web-side wrapper around the Electron `window.api.packages` runtime IPC — the
 * "Software" half of the unified Package Manager (Python, FFmpeg, Node, pandoc,
 * yt-dlp, …, installed via conda/micromamba or npm in the desktop app).
 *
 * Runtime installation only exists in the Electron main process, so every
 * method degrades to a no-op when `window.api.packages` is absent (pure
 * browser / server mode). Components gate on `available` and show a
 * desktop-only notice instead.
 */
import { create } from "zustand";

import { createErrorMessage } from "../utils/errorHandling";
import { trpcClient } from "../trpc/client";
import {
  createPackageConsoleSlice,
  runPackageOp,
  type PackageConsoleSlice,
  type PackageOpState
} from "./packageStorePlumbing";

/** Display names for the runtimes the server reports (it sends bare ids). */
const SERVER_RUNTIME_LABELS: Record<string, string> = {
  python: "Python",
  nodejs: "Node.js",
  ffmpeg: "FFmpeg",
  ffprobe: "ffprobe",
  pandoc: "Pandoc",
  pdftotext: "PDF Tools (pdftotext)",
  pdftoppm: "PDF Tools (pdftoppm)",
  "yt-dlp": "yt-dlp"
};

interface RuntimePackageStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  installing: boolean;
}

interface RuntimePackagesStore extends PackageOpState, PackageConsoleSlice {
  /** True when the Electron runtime IPC is reachable. */
  available: boolean;
  statuses: RuntimePackageStatus[];
  installLocation: string | null;
  isLoading: boolean;

  install: (id: string) => Promise<boolean>;
  uninstall: (id: string) => Promise<boolean>;
  selectInstallLocation: () => Promise<void>;
}

const runtimeApi = () =>
  typeof window !== "undefined" ? window.api?.packages : undefined;

const useRuntimePackagesStore = create<RuntimePackagesStore>((set, get) => ({
  available:
    typeof window !== "undefined" && Boolean(window.api?.packages),
  statuses: [],
  installLocation: null,
  busyIds: [],
  isLoading: false,
  error: null,
  ...createPackageConsoleSlice<RuntimePackagesStore>(set),

  refresh: async () => {
    const api = runtimeApi();
    if (!api) {
      // No desktop IPC (browser / Docker deployment): the server can still say
      // what is on its PATH, so the list reports real status even though
      // installing from here isn't possible.
      set({ available: false, isLoading: true, error: null });
      try {
        const res = await trpcClient.packs.runtimeStatuses.query();
        set({
          statuses: res.statuses.map(({ id, installed }) => ({
            id,
            name: SERVER_RUNTIME_LABELS[id] ?? id,
            description: installed
              ? "Installed on the server."
              : "Not installed on the server.",
            installed,
            installing: false
          })),
          isLoading: false
        });
      } catch (err: unknown) {
        set({
          isLoading: false,
          error: createErrorMessage(err, "Failed to load runtime packages")
            .message
        });
      }
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const [statuses, installLocation] = await Promise.all([
        api.getRuntimeStatuses(),
        api.getInstallLocation().catch(() => null)
      ]);
      set({ statuses, installLocation, isLoading: false, available: true });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: createErrorMessage(err, "Failed to load runtime packages")
          .message
      });
    }
  },

  install: async (id) => {
    const api = runtimeApi();
    if (!api) return false;
    return runPackageOp(
      set,
      get,
      [id],
      (runtimeId) => api.installRuntime(runtimeId),
      "Failed to install runtime",
      false
    );
  },

  uninstall: async (id) => {
    const api = runtimeApi();
    if (!api?.uninstallRuntime) return false;
    return runPackageOp(
      set,
      get,
      [id],
      (runtimeId) => api.uninstallRuntime!(runtimeId),
      "Failed to uninstall runtime",
      false
    );
  },

  selectInstallLocation: async () => {
    const api = runtimeApi();
    if (!api) return;
    try {
      const next = await api.selectInstallLocation();
      if (next) set({ installLocation: next });
    } catch (err: unknown) {
      set({
        error: createErrorMessage(err, "Failed to set install location").message
      });
    }
  }
}));

export default useRuntimePackagesStore;
