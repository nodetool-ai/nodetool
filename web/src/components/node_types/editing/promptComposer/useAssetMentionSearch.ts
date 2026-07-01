import { useCallback, useEffect, useMemo, useState } from "react";

import { useAssetStore } from "../../../../stores/AssetStore";
import { useRecentAssetsStore } from "../../../../stores/RecentAssetsStore";
import type { Asset } from "../../../../stores/ApiTypes";

export type MentionTab = "recent" | "saved";

export interface AssetMentionSearch {
  activeTab: MentionTab;
  setActiveTab: (tab: MentionTab) => void;
  /** Assets shown for the active tab (recent list or saved-search results). */
  displayedAssets: Asset[];
  /**
   * Persist a rename, rejecting on a name collision within the visible scope so
   * two assets in the same bucket can't share a name.
   */
  handleRename: (id: string, name: string) => Promise<void>;
}

/**
 * Recent/Saved asset lookup shared by every `@`-mention picker (the Lexical
 * prompt composer and the media chat composer). Given the text typed after `@`
 * (`null` while no mention is active), it exposes the two buckets — **Recent**
 * (assets used this session) and **Saved** (the library, debounced-searched by
 * the query) — plus a rename that syncs back to the asset library.
 */
export const useAssetMentionSearch = (
  queryString: string | null
): AssetMentionSearch => {
  const search = useAssetStore((state) => state.search);
  const updateAsset = useAssetStore((state) => state.update);
  const recentAssets = useRecentAssetsStore((state) => state.recentAssets);
  const renameRecentAsset = useRecentAssetsStore(
    (state) => state.renameRecentAsset
  );

  const [savedAssets, setSavedAssets] = useState<Asset[]>([]);
  const [activeTab, setActiveTab] = useState<MentionTab>(
    recentAssets.length > 0 ? "recent" : "saved"
  );

  useEffect(() => {
    if (queryString === null) {
      setSavedAssets([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      search({ query: queryString, page_size: 24 })
        .then((result) => {
          if (active) {
            setSavedAssets(result.assets ?? []);
          }
        })
        .catch(() => {
          if (active) {
            setSavedAssets([]);
          }
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [queryString, search]);

  const filteredRecent = useMemo(() => {
    const q = (queryString ?? "").trim().toLowerCase();
    if (!q) {
      return recentAssets;
    }
    return recentAssets.filter((a) =>
      (a.name || a.id).toLowerCase().includes(q)
    );
  }, [recentAssets, queryString]);

  const displayedAssets = activeTab === "recent" ? filteredRecent : savedAssets;

  const handleRename = useCallback(
    async (id: string, name: string) => {
      const collision = displayedAssets.some(
        (a) => a.id !== id && (a.name || a.id) === name
      );
      if (collision) {
        throw new Error("Name already in use");
      }
      await updateAsset({ id, name });
      renameRecentAsset(id, name);
      setSavedAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, name } : a))
      );
    },
    [displayedAssets, updateAsset, renameRecentAsset]
  );

  return { activeTab, setActiveTab, displayedAssets, handleRename };
};
