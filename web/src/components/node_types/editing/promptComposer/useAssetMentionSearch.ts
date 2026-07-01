import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAssetStore } from "../../../../stores/AssetStore";
import { useRecentAssetsStore } from "../../../../stores/RecentAssetsStore";
import type { Asset } from "../../../../stores/ApiTypes";

export type MentionTab = "recent" | "saved";

const PAGE_SIZE = 24;

export interface AssetMentionSearch {
  activeTab: MentionTab;
  setActiveTab: (tab: MentionTab) => void;
  /** Assets shown for the active tab (recent list or saved-search results). */
  displayedAssets: Asset[];
  /** Whether the Saved tab has more results beyond `displayedAssets`. */
  hasMoreSaved: boolean;
  /** Fetch the next page of saved results and append them. */
  loadMoreSaved: () => void;
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
  const [savedCursor, setSavedCursor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MentionTab>(
    recentAssets.length > 0 ? "recent" : "saved"
  );

  // Bumped on every query change so in-flight requests from a stale query
  // (including a stale loadMoreSaved) can recognize themselves as outdated
  // and skip applying their result.
  const queryTokenRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // An empty query still hits the server: it's treated as "browse everything",
  // so the Saved tab has content to scroll through before the user types.
  useEffect(() => {
    queryTokenRef.current += 1;
    const token = queryTokenRef.current;
    loadingMoreRef.current = false;
    if (queryString === null) {
      setSavedAssets([]);
      setSavedCursor(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      search({ query: queryString, page_size: PAGE_SIZE })
        .then((result) => {
          if (active && queryTokenRef.current === token) {
            // Folders aren't attachable — the mention picker is for files only.
            setSavedAssets(
              (result.assets ?? []).filter((a) => a.content_type !== "folder")
            );
            setSavedCursor(result.next_cursor ?? null);
          }
        })
        .catch(() => {
          if (active && queryTokenRef.current === token) {
            setSavedAssets([]);
            setSavedCursor(null);
          }
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [queryString, search]);

  const loadMoreSaved = useCallback(() => {
    if (!savedCursor || queryString === null || loadingMoreRef.current) {
      return;
    }
    const cursor = savedCursor;
    const token = queryTokenRef.current;
    loadingMoreRef.current = true;
    search({ query: queryString, page_size: PAGE_SIZE, cursor })
      .then((result) => {
        if (queryTokenRef.current !== token) {
          return;
        }
        const nextAssets = (result.assets ?? []).filter(
          (a) => a.content_type !== "folder"
        );
        setSavedAssets((prev) => [...prev, ...nextAssets]);
        setSavedCursor(result.next_cursor ?? null);
      })
      .catch(() => {
        if (queryTokenRef.current === token) {
          setSavedCursor(null);
        }
      })
      .finally(() => {
        if (queryTokenRef.current === token) {
          loadingMoreRef.current = false;
        }
      });
  }, [savedCursor, queryString, search]);

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

  return {
    activeTab,
    setActiveTab,
    displayedAssets,
    hasMoreSaved: savedCursor !== null,
    loadMoreSaved,
    handleRename
  };
};
