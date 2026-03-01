import { create } from "zustand";
import {
  checkHfCacheStatus,
  type HfCacheStatusRequestItem,
  type HfCacheStatusResponseItem
} from "../serverState/checkHfCacheStatus";

interface HfCacheStatusStore {
  statuses: Record<string, boolean>;
  pending: Record<string, boolean>;
  version: number;
  setStatuses: (results: HfCacheStatusResponseItem[]) => void;
  markPending: (keys: string[]) => void;
  clearPending: (keys: string[]) => void;
  invalidate: (keys?: string[]) => void;
  ensureStatuses: (items: HfCacheStatusRequestItem[]) => Promise<void>;
}

export const useHfCacheStatusStore = create<HfCacheStatusStore>((set, get) => ({
  statuses: {},
  pending: {},
  version: 0,
  setStatuses: (results) =>
    set((state) => {
      if (results.length === 0) {
        return state;
      }
      const next = { ...state.statuses };
      for (const result of results) {
        next[result.key] = result.downloaded;
      }
      return { statuses: next };
    }),
  markPending: (keys) =>
    set((state) => {
      if (keys.length === 0) {
        return state;
      }
      const next = { ...state.pending };
      for (const key of keys) {
        next[key] = true;
      }
      return { pending: next };
    }),
  clearPending: (keys) =>
    set((state) => {
      if (keys.length === 0) {
        return state;
      }
      const next = { ...state.pending };
      for (const key of keys) {
        delete next[key];
      }
      return { pending: next };
    }),
  invalidate: (keys) =>
    set((state) => {
      if (!keys || keys.length === 0) {
        return { statuses: {}, pending: {}, version: state.version + 1 };
      }
      const nextStatuses = { ...state.statuses };
      const nextPending = { ...state.pending };
      const keysToRemove = new Set(keys);
      const statusKeys = Object.keys(state.statuses);

      keys.forEach((key) => {
        const parts = key.split("/");
        if (parts.length >= 2) {
          const repoId = `${parts[0]}/${parts[1]}`;
          statusKeys.forEach((statusKey) => {
            if (
              statusKey === repoId ||
              statusKey.startsWith(`${repoId}/`)
            ) {
              keysToRemove.add(statusKey);
            }
          });
        }
      });

      keysToRemove.forEach((key) => {
        delete nextStatuses[key];
        delete nextPending[key];
      });
      return {
        statuses: nextStatuses,
        pending: nextPending,
        version: state.version + 1
      };
    }),
  ensureStatuses: async (items) => {
    if (items.length === 0) {
      return;
    }
    const { statuses, pending } = get();
    const requests = items.filter(
      (item) => statuses[item.key] === undefined && !pending[item.key]
    );

    if (requests.length === 0) {
      return;
    }

    const keys = requests.map((request) => request.key);
    get().markPending(keys);
    try {
      const results = await checkHfCacheStatus(requests);
      get().setStatuses(results);
    } catch {
      // Keep existing statuses on transient failures; avoid persisting false negatives.
    } finally {
      get().clearPending(keys);
    }
  }
}));
