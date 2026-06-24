/**
 * OptionalNodePacksStore
 *
 * Tracks which optional node packs the user has revealed in the node menu.
 * Optional packs (see config/optionalNodePacks.ts) are hidden by default to
 * keep the menu focused; enabling one reveals its namespaces in the namespace
 * tree. Persists to localStorage so the choice sticks across sessions.
 *
 * This is a pure UI/visibility preference — it never registers or unregisters
 * nodes on the server.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { OPTIONAL_NODE_PACKS } from "../config/optionalNodePacks";

interface OptionalNodePacksStore {
  /** Ids of the optional packs the user has turned on. */
  enabledPackIds: string[];
  isPackEnabled: (id: string) => boolean;
  setPackEnabled: (id: string, enabled: boolean) => void;
  togglePack: (id: string) => void;
  enableAll: () => void;
  disableAll: () => void;
}

const VALID_IDS = new Set(OPTIONAL_NODE_PACKS.map((pack) => pack.id));

export const useOptionalNodePacksStore = create<OptionalNodePacksStore>()(
  persist(
    (set, get) => ({
      enabledPackIds: [],

      isPackEnabled: (id) => get().enabledPackIds.includes(id),

      setPackEnabled: (id, enabled) => {
        if (!VALID_IDS.has(id)) return;
        set((state) => {
          const has = state.enabledPackIds.includes(id);
          if (enabled === has) return state;
          return {
            enabledPackIds: enabled
              ? [...state.enabledPackIds, id]
              : state.enabledPackIds.filter((p) => p !== id)
          };
        });
      },

      togglePack: (id) => {
        get().setPackEnabled(id, !get().isPackEnabled(id));
      },

      enableAll: () => {
        set({ enabledPackIds: OPTIONAL_NODE_PACKS.map((pack) => pack.id) });
      },

      disableAll: () => {
        set({ enabledPackIds: [] });
      }
    }),
    {
      name: "nodetool-optional-node-packs",
      version: 1,
      // Drop ids for packs that no longer exist so stale storage can't keep a
      // removed namespace visible.
      migrate: (persisted) => {
        const state = persisted as Partial<OptionalNodePacksStore> | undefined;
        return {
          ...state,
          enabledPackIds: (state?.enabledPackIds ?? []).filter((id) =>
            VALID_IDS.has(id)
          )
        } as OptionalNodePacksStore;
      }
    }
  )
);

export default useOptionalNodePacksStore;
