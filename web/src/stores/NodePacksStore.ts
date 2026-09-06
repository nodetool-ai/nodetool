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

import { createErrorMessage } from "../utils/errorHandling";
import {
  createPackageConsoleSlice,
  runPackageOp,
  type PackageConsoleSlice,
  type PackageOpState
} from "./packageStorePlumbing";

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

interface NodePacksStore extends PackageOpState, PackageConsoleSlice {
  /** True when the Electron registry IPC is reachable. */
  available: boolean;
  availablePacks: PackageInfo[];
  installed: InstalledPackage[];
  isLoading: boolean;

  install: (repoId: string) => Promise<boolean>;
  uninstall: (repoId: string) => Promise<boolean>;
  update: (repoId: string) => Promise<boolean>;
  /** Update every installed pack that has an available upgrade, restarting the
   *  backend once at the end rather than after each pack. */
  updateAll: () => Promise<boolean>;
}

const packagesApi = () =>
  typeof window !== "undefined" ? window.api?.packages : undefined;

/** Registry install lives only in Electron; `listAvailable` is the marker. */
const ipcAvailable = () => Boolean(packagesApi()?.listAvailable);

const useNodePacksStore = create<NodePacksStore>((set, get) => ({
  available: ipcAvailable(),
  availablePacks: [],
  installed: [],
  busyIds: [],
  isLoading: false,
  error: null,
  ...createPackageConsoleSlice<NodePacksStore>(set),

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
    return runPackageOp(
      set,
      get,
      [repoId],
      (id) => api.install!(id),
      "Failed to install pack",
      true
    );
  },

  uninstall: async (repoId) => {
    const api = packagesApi();
    if (!api?.uninstall) return false;
    return runPackageOp(
      set,
      get,
      [repoId],
      (id) => api.uninstall!(id),
      "Failed to uninstall pack",
      false
    );
  },

  update: async (repoId) => {
    const api = packagesApi();
    if (!api?.update) return false;
    return runPackageOp(
      set,
      get,
      [repoId],
      (id) => api.update!(id),
      "Failed to update pack",
      true
    );
  },

  updateAll: async () => {
    const api = packagesApi();
    if (!api?.update) return false;
    const repoIds = get()
      .installed.filter((p) => p.hasUpdate)
      .map((p) => p.repo_id);
    if (repoIds.length === 0) return false;
    // One restart after the batch so the registry reloads all updated packs.
    return runPackageOp(
      set,
      get,
      repoIds,
      (id) => api.update!(id),
      "Failed to update pack",
      true
    );
  }
}));

export default useNodePacksStore;
