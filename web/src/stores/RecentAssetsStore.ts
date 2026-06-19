/**
 * RecentAssetsStore — session-scoped list of assets recently referenced from a
 * prompt composer.
 *
 * The Prompt node never caches asset bytes; it stores `asset://<id>` URNs and
 * the runtime dereferences them. "Recent" is therefore purely a UI convenience:
 * the assets a user has just inserted or dragged into a prompt during this
 * session, surfaced first in the `@`-mention picker so they don't have to be
 * searched for again.
 *
 * In-memory only (newest first, de-duplicated by id, capped) — it resets on
 * reload, matching the "current session" semantics.
 */
import { create } from "zustand";
import type { Asset } from "./ApiTypes";

const MAX_RECENT = 50;

type RecentAssetsStore = {
  recentAssets: Asset[];
  /** Record an asset as recently used, moving it to the front. */
  addRecentAsset: (asset: Asset) => void;
  /** Drop an asset from the recent list (does not delete the asset). */
  removeRecentAsset: (id: string) => void;
  /** Reflect a rename so the recent list shows the current name. */
  renameRecentAsset: (id: string, name: string) => void;
  clearRecentAssets: () => void;
};

export const useRecentAssetsStore = create<RecentAssetsStore>((set) => ({
  recentAssets: [],
  addRecentAsset: (asset) =>
    set((state) => ({
      recentAssets: [
        asset,
        ...state.recentAssets.filter((a) => a.id !== asset.id)
      ].slice(0, MAX_RECENT)
    })),
  removeRecentAsset: (id) =>
    set((state) => ({
      recentAssets: state.recentAssets.filter((a) => a.id !== id)
    })),
  renameRecentAsset: (id, name) =>
    set((state) => ({
      recentAssets: state.recentAssets.map((a) =>
        a.id === id ? { ...a, name } : a
      )
    })),
  clearRecentAssets: () => set({ recentAssets: [] })
}));
