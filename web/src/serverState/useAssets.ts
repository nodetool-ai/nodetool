import { useCallback, useMemo } from "react";
import { useInfiniteQuery } from "react-query";
import { Asset, AssetList } from "../stores/ApiTypes";
import { useAssetStore } from "../hooks/AssetStore";
import { useSettingsStore } from "../stores/SettingsStore";
import useAuth from "../stores/useAuth";

type AssetLoadParams = {
  pageParam?: string;
};

const useAssets = () => {
  const { user: currentUser } = useAuth();
  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);

  const { currentFolderId, loadCurrentFolder, loadFolderById } =
    useAssetStore();

  interface SortedAssetsByType {
    assetsByType: Record<string, Asset[]>;
    totalCount: number;
  }

  const sortAssetsByType = useCallback(
    (
      assets: Asset[],
      sortOrder: "asc" | "desc" = "asc"
    ): SortedAssetsByType => {
      const assetsByType: Record<string, Asset[]> = {
        folder: [],
        image: [],
        audio: [],
        video: [],
        text: [],
        other: []
      };
      let totalCount = 0;

      assets.forEach((asset) => {
        const mainType = asset.content_type.split("/")[0];
        if (Object.prototype.hasOwnProperty.call(assetsByType, mainType)) {
          assetsByType[mainType].push(asset);
        } else {
          assetsByType.other.push(asset);
        }
        totalCount++;
      });

      Object.keys(assetsByType).forEach((type) => {
        if (assetsOrder === "date" && assets[0]?.created_at) {
          assetsByType[type].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
          });
        } else {
          assetsByType[type].sort((a, b) =>
            sortOrder === "asc"
              ? a.name.localeCompare(b.name)
              : b.name.localeCompare(a.name)
          );
        }
      });

      return { assetsByType, totalCount };
    },
    [assetsOrder]
  );

  const sortAssetsByTypeFlat = useCallback(
    (
      assets: Asset[],
      sortOrder: "asc" | "desc" = "asc",
      includeFolders: boolean = false,
      onlyFolders: boolean = false
    ): Asset[] => {
      const sortedByType = sortAssetsByType(assets, sortOrder);
      const flatSortedAssets = Object.values(sortedByType.assetsByType).flat();
      const filteredAssets = onlyFolders
        ? flatSortedAssets.filter((asset) => asset.content_type === "folder")
        : includeFolders
        ? flatSortedAssets
        : flatSortedAssets.filter((asset) => asset.content_type !== "folder");

      return filteredAssets;
    },
    [sortAssetsByType]
  );

  const loadFolder = useCallback(
    async ({ pageParam }: AssetLoadParams) => {
      return await loadCurrentFolder(pageParam);
    },
    [loadCurrentFolder]
  );

  const loadFolderId = useCallback(
    async (id: string) => {
      return await loadFolderById(id);
    },
    [loadFolderById]
  );

  const { data, error, isLoading, hasNextPage, fetchNextPage, refetch } =
    useInfiniteQuery<AssetList, Error>(
      ["assets", { parent_id: currentFolderId || currentUser?.id }],
      loadFolder,
      {
        getNextPageParam: (lastPage, pages) => lastPage.next
      }
    );

  const currentAssets = useMemo(() => {
    return data ? data.pages.flatMap((page) => page.assets) : [];
  }, [data]);

  const getAssetById = useCallback(
    (assetId: string): Asset | undefined => {
      return currentAssets.find((asset) => asset.id === assetId);
    },
    [currentAssets]
  );

  const getAssetsById = useCallback(
    (assetIds: string[]): Asset[] => {
      return currentAssets.filter((asset) => assetIds.includes(asset.id));
    },
    [currentAssets]
  );

  const sortedAssetsByType = useMemo(() => {
    return sortAssetsByType(currentAssets);
  }, [currentAssets, sortAssetsByType]);

  const sortedAssets = useMemo(() => {
    return sortAssetsByTypeFlat(currentAssets);
  }, [currentAssets, sortAssetsByTypeFlat]);

  const sortedFolders = useMemo(() => {
    return sortAssetsByTypeFlat(currentAssets, "asc", true, true);
  }, [currentAssets, sortAssetsByTypeFlat]);

  const sortedFiles = useMemo(() => {
    return sortAssetsByTypeFlat(currentAssets, "asc", false);
  }, [currentAssets, sortAssetsByTypeFlat]);

  return {
    sortedAssets,
    sortedAssetsByType,
    sortedFolders,
    sortedFiles,
    currentAssets,
    loadFolder,
    loadFolderId,
    getAssetById,
    getAssetsById,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    refetch
  };
};

export default useAssets;
