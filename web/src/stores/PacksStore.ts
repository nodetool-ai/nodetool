/**
 * Pack management store — backs the Settings → Packages tab.
 *
 * Wraps the `settings.packs` tRPC router. Pack discovery happens once on the
 * server at startup; this store mirrors the snapshot and triggers a `reload`
 * after trust changes or installs.
 */

import { create } from "zustand";

import { trpcClient } from "../trpc/client";
import { createErrorMessage } from "../utils/errorHandling";

export type PackStatus = "loaded" | "skipped" | "error";

export type SkipReason =
  | "not-allowed"
  | "api-version"
  | "reserved-namespace"
  | "collision"
  | "no-node-type";

export interface SkippedNode {
  nodeType: string;
  reason: SkipReason;
}

export interface PackInfo {
  name: string;
  version?: string;
  status: PackStatus;
  reason?: string;
  registered: string[];
  skippedNodes: SkippedNode[];
  error?: string;
}

export interface PackTrust {
  allowlist: string[];
  allowUnlisted: boolean;
}

interface PacksStore {
  packs: PackInfo[];
  trust: PackTrust;
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  /** Toggle one pack on/off in the allowlist and soft-reload. */
  setTrusted: (packName: string, trusted: boolean) => Promise<void>;
  setAllowUnlisted: (allow: boolean) => Promise<void>;
  /** Re-scan and re-register installed packs. */
  reload: () => Promise<void>;
}

const usePacksStore = create<PacksStore>((set, get) => ({
  packs: [],
  trust: { allowlist: [], allowUnlisted: false },
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const [packsRes, trust] = await Promise.all([
        trpcClient.packs.list.query(),
        trpcClient.packs.getTrust.query()
      ]);
      set({ packs: packsRes.packs, trust, isLoading: false });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: createErrorMessage(err, "Failed to load packs").message
      });
    }
  },

  setTrusted: async (packName, trusted) => {
    const { trust } = get();
    const current = new Set(trust.allowlist);
    if (trusted) current.add(packName);
    else current.delete(packName);
    const allowlist = [...current];
    try {
      const next = await trpcClient.packs.setTrust.mutate({ allowlist });
      set({ trust: next });
      const refreshed = await trpcClient.packs.reload.mutate();
      set({ packs: refreshed.packs });
    } catch (err: unknown) {
      set({ error: createErrorMessage(err, "Failed to update pack trust").message });
    }
  },

  setAllowUnlisted: async (allowUnlisted) => {
    try {
      const next = await trpcClient.packs.setTrust.mutate({ allowUnlisted });
      set({ trust: next });
      const refreshed = await trpcClient.packs.reload.mutate();
      set({ packs: refreshed.packs });
    } catch (err: unknown) {
      set({
        error: createErrorMessage(err, "Failed to update allowUnlisted setting").message
      });
    }
  },

  reload: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await trpcClient.packs.reload.mutate();
      set({ packs: res.packs, isLoading: false });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: createErrorMessage(err, "Failed to reload packs").message
      });
    }
  }
}));

export default usePacksStore;
