import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Entity } from "@nodetool-ai/protocol";
import { useAssetStore } from "../../../../stores/AssetStore";
import { useRecentAssetsStore } from "../../../../stores/RecentAssetsStore";
import { useEntities } from "../../../../serverState/useEntities";
import type { Asset } from "../../../../stores/ApiTypes";
import { filterEntitiesForMention } from "../../../entities/filterEntities";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../../../stores/WorkspaceTabsStore";

export { filterEntitiesForMention };

export type MentionTab = "recent" | "saved";

const PAGE_SIZE = 24;

interface AssetMentionSearch {
  activeTab: MentionTab;
  setActiveTab: (tab: MentionTab) => void;
  /**
   * Library entities matching the query, shown in a row above the asset grid.
   * In the picker's combined selection order these come first: indices
   * `0..entities.length-1` are entities, assets follow.
   */
  entities: Entity[];
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
 * `initialTab` overrides the opening bucket, which otherwise is Recent when
 * there is anything recent.
 */
export const useAssetMentionSearch = (
  queryString: string | null,
  initialTab?: MentionTab
): AssetMentionSearch => {
  const search = useAssetStore((state) => state.search);
  const updateAsset = useAssetStore((state) => state.update);
  const { data: allEntities } = useEntities();
  const activeProjectId =
    useWorkspaceTabsStore((state) => state.activeProjectId) ?? LOOSE_PROJECT_ID;
  const recentAssets = useRecentAssetsStore((state) => state.recentAssets);
  const renameRecentAsset = useRecentAssetsStore(
    (state) => state.renameRecentAsset
  );

  const [savedAssets, setSavedAssets] = useState<Asset[]>([]);
  const [savedCursor, setSavedCursor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MentionTab>(
    initialTab ?? (recentAssets.length > 0 ? "recent" : "saved")
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
      search({
        query: queryString,
        page_size: PAGE_SIZE,
        project_id: activeProjectId
      })
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
  }, [queryString, search, activeProjectId]);

  const loadMoreSaved = useCallback(() => {
    if (!savedCursor || queryString === null || loadingMoreRef.current) {
      return;
    }
    const cursor = savedCursor;
    const token = queryTokenRef.current;
    loadingMoreRef.current = true;
    search({
      query: queryString,
      page_size: PAGE_SIZE,
      cursor,
      project_id: activeProjectId
    })
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
  }, [savedCursor, queryString, search, activeProjectId]);

  const scopedRecentAssets = useMemo(
    () =>
      recentAssets.filter(
        (asset) => (asset.project_id ?? LOOSE_PROJECT_ID) === activeProjectId
      ),
    [recentAssets, activeProjectId]
  );

  const filteredRecent = useMemo(() => {
    const q = (queryString ?? "").trim().toLowerCase();
    if (!q) {
      return scopedRecentAssets;
    }
    return scopedRecentAssets.filter((a) =>
      (a.name || a.id).toLowerCase().includes(q)
    );
  }, [scopedRecentAssets, queryString]);

  const displayedAssets = activeTab === "recent" ? filteredRecent : savedAssets;

  const entities = useMemo(
    () =>
      queryString === null
        ? []
        : filterEntitiesForMention(allEntities ?? [], queryString),
    [allEntities, queryString]
  );

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
    entities,
    displayedAssets,
    hasMoreSaved: savedCursor !== null,
    loadMoreSaved,
    handleRename
  };
};
