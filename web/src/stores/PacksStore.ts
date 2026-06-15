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
import { loadMetadata } from "../serverState/useMetadata";

type PackStatus = "loaded" | "skipped" | "error";

export type SkipReason =
  | "not-allowed"
  | "api-version"
  | "reserved-namespace"
  | "collision"
  | "no-node-type";

interface SkippedNode {
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

interface PackTrust {
  allowlist: string[];
  allowUnlisted: boolean;
}

/** A first-party pack shipped with NodeTool and its enabled state. */
interface BuiltinPack {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  required: boolean;
}

interface PacksStore {
  packs: PackInfo[];
  trust: PackTrust;
  builtins: BuiltinPack[];
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  /** Load the built-in pack list (cheap; safe to call from any component). */
  fetchBuiltins: () => Promise<void>;
  /**
   * Enable/disable a built-in pack. The server applies the change to its live
   * registry, so on success node metadata is refetched and new nodes appear
   * without a restart. Resolves to `true` on success.
   */
  setBuiltinEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  /** Toggle one pack on/off in the allowlist and soft-reload. */
  setTrusted: (packName: string, trusted: boolean) => Promise<void>;
  setAllowUnlisted: (allow: boolean) => Promise<void>;
  /** Re-scan and re-register installed packs. */
  reload: () => Promise<void>;
}

/**
 * Serializes trust mutations. `setTrusted` does a read-modify-write of the
 * allowlist; if two rapid toggles each read the pre-await state, the second
 * overwrites the first server-side. Each mutation is chained onto this
 * promise and reads `get().trust` only once the previous one has settled.
 * Tasks never reject (errors are captured into store state), so plain
 * `.then` chaining is safe.
 */
let trustMutation: Promise<unknown> = Promise.resolve();

const usePacksStore = create<PacksStore>((set, get) => ({
  packs: [],
  trust: { allowlist: [], allowUnlisted: false },
  builtins: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const [packsRes, trust, builtinsRes] = await Promise.all([
        trpcClient.packs.list.query(),
        trpcClient.packs.getTrust.query(),
        trpcClient.packs.listBuiltins.query()
      ]);
      set({
        packs: packsRes.packs,
        trust,
        builtins: builtinsRes.packs,
        isLoading: false
      });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: createErrorMessage(err, "Failed to load packs").message
      });
    }
  },

  fetchBuiltins: async () => {
    try {
      const res = await trpcClient.packs.listBuiltins.query();
      set({ builtins: res.packs });
    } catch (err: unknown) {
      set({
        error: createErrorMessage(err, "Failed to load built-in packs").message
      });
    }
  },

  setBuiltinEnabled: async (id, enabled) => {
    try {
      const res = await trpcClient.packs.setBuiltinEnabled.mutate({
        id,
        enabled
      });
      set({ builtins: res.packs });
      // The server already applied the toggle to its live registry; pull the
      // refreshed node metadata so (placeholder) nodes re-render immediately.
      await loadMetadata();
      return true;
    } catch (err: unknown) {
      set({
        error: createErrorMessage(err, "Failed to update built-in pack").message
      });
      return false;
    }
  },

  setTrusted: (packName, trusted) => {
    const task = async (): Promise<void> => {
      // Read trust INSIDE the chained task so it sees the previous
      // mutation's result instead of a stale pre-await snapshot.
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
    };
    const run = trustMutation.then(task);
    trustMutation = run;
    return run;
  },

  setAllowUnlisted: (allowUnlisted) => {
    const task = async (): Promise<void> => {
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
    };
    // Chained on the same queue so allowUnlisted updates don't interleave
    // with allowlist read-modify-writes on the shared trust object.
    const run = trustMutation.then(task);
    trustMutation = run;
    return run;
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
