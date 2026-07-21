/**
 * NodePacksStore
 *
 * Web-side wrapper around the Electron `window.api.packages` registry IPC — the
 * Python node packs (nodetool-base, nodetool-huggingface, …) installed via
 * uv/pip in the desktop app. This is the "rich installer" half of the unified
 * Package Manager's Node Packs tab: list available + installed packs,
 * install / update / uninstall, and stream the install console live.
 *
 * Registry install only exists in the Electron main process, so every method
 * degrades to a no-op when the IPC is absent (pure browser / server mode).
 * Components gate on `available` and show a desktop-only notice instead.
 */
import { create } from "zustand";
import type { StoreApi } from "zustand";

import { createErrorMessage } from "../utils/errorHandling";

/** A pack offered by the registry (may or may not be installed). */
export interface PackageInfo {
  name: string;
  description: string;
  repo_id: string;
  namespaces?: string[];
  version?: string;
}

/** An installed pack, with upgrade availability when the registry is newer. */
export interface InstalledPackage {
  name: string;
  description: string;
  version: string;
  repo_id: string;
  authors?: string[];
  latestVersion?: string;
  hasUpdate?: boolean;
}

export interface PackageActionResult {
  success: boolean;
  message: string;
}

const MAX_CONSOLE_LINES = 500;

interface NodePacksStore {
  /** True when the Electron registry IPC is reachable. */
  available: boolean;
  availablePacks: PackageInfo[];
  installed: InstalledPackage[];
  /** repo_ids with an install/uninstall/update in flight (per-row spinners). */
  busyIds: string[];
  consoleLines: string[];
  isLoading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  install: (repoId: string) => Promise<boolean>;
  uninstall: (repoId: string) => Promise<boolean>;
  update: (repoId: string) => Promise<boolean>;
  /** Update every installed pack that has an available upgrade, restarting the
   *  backend once at the end rather than after each pack. */
  updateAll: () => Promise<boolean>;
  subscribeConsole: () => void;
  unsubscribeConsole: () => void;
  clearConsole: () => void;
}

/** Unsubscribe handle for the server-log stream; module-level so it survives
 * re-renders and never lands in serializable state. */
let logUnsubscribe: (() => void) | null = null;

const packagesApi = () =>
  typeof window !== "undefined" ? window.api?.packages : undefined;

/** Registry install lives only in Electron; `listAvailable` is the marker. */
const ipcAvailable = () => Boolean(packagesApi()?.listAvailable);

type SetState = StoreApi<NodePacksStore>["setState"];
type GetState = StoreApi<NodePacksStore>["getState"];

/**
 * Run an install/uninstall/update: flag the row busy, run the op, refresh, then
 * apply the outcome. The outcome is set *after* refresh so a failure message
 * survives (refresh clears `error`). Operations that change which nodes are
 * importable restart the backend so the registry reloads.
 */
async function runPackOp(
  set: SetState,
  get: GetState,
  id: string,
  op: () => Promise<PackageActionResult>,
  verb: "install" | "uninstall" | "update",
  restartAfter: boolean
): Promise<boolean> {
  set((s) => ({ busyIds: [...new Set([...s.busyIds, id])] }));
  let success = false;
  let message = "";
  try {
    const res = await op();
    success = res.success;
    message = res.message;
  } catch (err: unknown) {
    message = createErrorMessage(err, `Failed to ${verb} pack`).message;
  }
  await get().refresh();
  set((s) => ({
    busyIds: s.busyIds.filter((p) => p !== id),
    error: success ? s.error : message
  }));
  if (success && restartAfter) {
    try {
      void window.api?.server?.restart?.();
    } catch {
      // Best-effort: the change is on disk; the user can restart manually.
    }
  }
  return success;
}

const useNodePacksStore = create<NodePacksStore>((set, get) => ({
  available: ipcAvailable(),
  availablePacks: [],
  installed: [],
  busyIds: [],
  consoleLines: [],
  isLoading: false,
  error: null,

  refresh: async () => {
    const api = packagesApi();
    if (!api?.listAvailable || !api?.listInstalled) {
      set({ available: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const [availableRes, installedRes] = await Promise.all([
        api.listAvailable().catch(() => ({ packages: [] as PackageInfo[] })),
        api.listInstalled().catch(() => ({ packages: [] as InstalledPackage[] }))
      ]);
      set({
        availablePacks: availableRes.packages ?? [],
        installed: installedRes.packages ?? [],
        isLoading: false,
        available: true
      });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: createErrorMessage(err, "Failed to load node packs").message
      });
    }
  },

  install: async (repoId) => {
    const api = packagesApi();
    if (!api?.install) return false;
    return runPackOp(set, get, repoId, () => api.install!(repoId), "install", true);
  },

  uninstall: async (repoId) => {
    const api = packagesApi();
    if (!api?.uninstall) return false;
    return runPackOp(
      set,
      get,
      repoId,
      () => api.uninstall!(repoId),
      "uninstall",
      false
    );
  },

  update: async (repoId) => {
    const api = packagesApi();
    if (!api?.update) return false;
    return runPackOp(set, get, repoId, () => api.update!(repoId), "update", true);
  },

  updateAll: async () => {
    const api = packagesApi();
    if (!api?.update) return false;
    const repoIds = get()
      .installed.filter((p) => p.hasUpdate)
      .map((p) => p.repo_id);
    if (repoIds.length === 0) return false;

    set((s) => ({ busyIds: [...new Set([...s.busyIds, ...repoIds])] }));
    let allOk = true;
    let lastMessage = "";
    for (const repoId of repoIds) {
      try {
        const res = await api.update!(repoId);
        if (!res.success) {
          allOk = false;
          lastMessage = res.message;
        }
      } catch (err: unknown) {
        allOk = false;
        lastMessage = createErrorMessage(err, "Failed to update pack").message;
      }
    }
    await get().refresh();
    set((s) => ({
      busyIds: s.busyIds.filter((p) => !repoIds.includes(p)),
      error: allOk ? s.error : lastMessage
    }));
    // One restart after the batch so the registry reloads all updated packs.
    if (allOk) {
      try {
        void window.api?.server?.restart?.();
      } catch {
        // Best-effort: changes are on disk; the user can restart manually.
      }
    }
    return allOk;
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

export default useNodePacksStore;
