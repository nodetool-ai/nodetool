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
import type { StoreApi } from "zustand";

import { createErrorMessage } from "../utils/errorHandling";

export interface RuntimePackageStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  installing: boolean;
}

const MAX_CONSOLE_LINES = 500;

interface RuntimePackagesStore {
  /** True when the Electron runtime IPC is reachable. */
  available: boolean;
  statuses: RuntimePackageStatus[];
  installLocation: string | null;
  /** Ids with an install/uninstall in flight (drives per-row spinners). */
  busyIds: string[];
  consoleLines: string[];
  isLoading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  install: (id: string) => Promise<boolean>;
  uninstall: (id: string) => Promise<boolean>;
  selectInstallLocation: () => Promise<void>;
  subscribeConsole: () => void;
  unsubscribeConsole: () => void;
  clearConsole: () => void;
}

/** Unsubscribe handle for the server-log stream; module-level so it survives
 * re-renders and never lands in serializable state. */
let logUnsubscribe: (() => void) | null = null;

const runtimeApi = () =>
  typeof window !== "undefined" ? window.api?.packages : undefined;

type SetState = StoreApi<RuntimePackagesStore>["setState"];
type GetState = StoreApi<RuntimePackagesStore>["getState"];

/**
 * Run an install/uninstall: flag the row busy, run the op, refresh statuses,
 * then apply the outcome. The outcome is set *after* refresh so a failure
 * message survives (refresh clears `error`).
 */
async function runRuntimeOp(
  set: SetState,
  get: GetState,
  id: string,
  op: () => Promise<{ success: boolean; message: string }>,
  verb: "install" | "uninstall"
): Promise<boolean> {
  set((s) => ({ busyIds: [...new Set([...s.busyIds, id])] }));
  let success = false;
  let message = "";
  try {
    const res = await op();
    success = res.success;
    message = res.message;
  } catch (err: unknown) {
    message = createErrorMessage(err, `Failed to ${verb} runtime`).message;
  }
  await get().refresh();
  set((s) => ({
    busyIds: s.busyIds.filter((p) => p !== id),
    error: success ? s.error : message
  }));
  return success;
}

const useRuntimePackagesStore = create<RuntimePackagesStore>((set, get) => ({
  available:
    typeof window !== "undefined" && Boolean(window.api?.packages),
  statuses: [],
  installLocation: null,
  busyIds: [],
  consoleLines: [],
  isLoading: false,
  error: null,

  refresh: async () => {
    const api = runtimeApi();
    if (!api) {
      set({ available: false });
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
    return runRuntimeOp(set, get, id, () => api.installRuntime(id), "install");
  },

  uninstall: async (id) => {
    const api = runtimeApi();
    if (!api?.uninstallRuntime) return false;
    return runRuntimeOp(
      set,
      get,
      id,
      () => api.uninstallRuntime!(id),
      "uninstall"
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
  },

  subscribeConsole: () => {
    const onLog =
      typeof window !== "undefined" ? window.api?.server?.onLog : undefined;
    if (!onLog || logUnsubscribe) return;
    logUnsubscribe = onLog((message: string) => {
      set((s) => ({
        consoleLines: [...s.consoleLines, message].slice(-MAX_CONSOLE_LINES)
      }));
    });
  },

  unsubscribeConsole: () => {
    logUnsubscribe?.();
    logUnsubscribe = null;
  },

  clearConsole: () => set({ consoleLines: [] })
}));

export default useRuntimePackagesStore;
