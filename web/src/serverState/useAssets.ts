import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";
import { Asset } from "../stores/ApiTypes";
import { useSettingsStore } from "../stores/SettingsStore";
import useAuth from "../stores/useAuth";
import { useAssetGridStore } from "../stores/AssetGridStore";
import { SIZE_FILTERS } from "../utils/formatUtils";

type FilterOptions = {
  searchTerm: string;
  contentType?: string | null;
  sizeFilter?: string;
};

type AssetUpdate = {
  id: string;
  status?: string;
  name?: string;
  parent_id?: string;
  content_type?: string;
  metadata?: Record<string, never>;
  data?: string;
  duration?: number;
};

export const useAssets = (_initialFolderId: string | null = null) => {
  const setCurrentFolderId = useAssetGridStore(
    (state) => state.setCurrentFolderId
  );
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const currentUser = useAuth((state) => state.user);
  const setCurrentFolder = useAssetGridStore((state) => state.setCurrentFolder);
  const loadCurrentFolder = useAssetStore((state) => state.loadCurrentFolder);
  const {
    load,
    loadFolderTree,
    update,
    delete: deleteAsset,
    createFolder
  } = useAssetStore();
  const { settings } = useSettingsStore();
  const queryClient = useQueryClient();
  const setSelectedFolderId = useAssetGridStore(
    (state) => state.setSelectedFolderId
  );
  const setSelectedFolderIds = useAssetGridStore(
    (state) => state.setSelectedFolderIds
  );
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const assetSearchTerm = useAssetGridStore((state) => state.assetSearchTerm);
  const sizeFilter = useAssetGridStore((state) => state.sizeFilter);

  if (currentUser === null) {
    throw new Error("User not logged");
  }

  // Fetch assets in the current folder
  const fetchAssets = useCallback(async () => {
    const result = await load({
      parent_id: currentFolderId || currentUser?.id
    });
    return result;
  }, [load, currentFolderId, currentUser?.id]);

  const {
    data: currentFolderAssets,
    error: currentFolderError,
    isLoading: isLoadingCurrentFolder
  } = useQuery({
    queryKey: ["assets", { parent_id: currentFolderId }],
    queryFn: fetchAssets,
    enabled: !!currentFolderId
  });

  const refetchAssets = useCallback(() => {
    return queryClient.invalidateQueries({
      queryKey: ["assets", { parent_id: currentFolderId }]
    });
  }, [queryClient, currentFolderId]);

  // Fetch all folders
  const fetchAllFolders = useCallback(async () => {
    return await loadFolderTree(settings.assetsOrder);
  }, [loadFolderTree, settings.assetsOrder]);

  const {
    data: folderTree,
    error: folderTreeError,
    isLoading: isLoadingFolderTree
  } = useQuery({
    queryKey: ["folderTree", settings.assetsOrder],
    queryFn: fetchAllFolders
  });

  const refetchFolders = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["folderTree"] });
  }, [queryClient]);

  const refetchAssetsAndFolders = useCallback(() => {
    refetchAssets();
    refetchFolders();
  }, [refetchAssets, refetchFolders]);

  // Process assets (sort by type and exclude folders)
  const processedAssets = useMemo(() => {
    if (!currentFolderAssets || !currentFolderAssets.assets) {return [];}

    const assetsArray = currentFolderAssets.assets;

    // Filter out folders
    const nonFolderAssets = assetsArray.filter(
      (asset) => asset.content_type !== "folder"
    );

    // Sort by content_type and then by the user's preferred order
    return nonFolderAssets.sort((a, b) => {
      if (a.content_type !== b.content_type) {
        return a.content_type.localeCompare(b.content_type);
      }
      if (settings.assetsOrder === "name") {
        return a.name.localeCompare(b.name);
      } else if (settings.assetsOrder === "date") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (settings.assetsOrder === "size") {
        // Sort by file size (largest first)
        const aSize = a.size;
        const bSize = b.size;
        if (aSize !== undefined && aSize !== null && bSize !== undefined && bSize !== null) {
          return bSize - aSize;
        }
        // Fall back to name sorting if size is not available
        return a.name.localeCompare(b.name);
      } else {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    });
  }, [currentFolderAssets, settings.assetsOrder]);

  // Filter assets
  const filterAssets = useCallback(
    (assetsToFilter: Asset[], options: FilterOptions) => {
      return assetsToFilter.filter((asset) => {
        const nameMatch = asset.name
          .toLowerCase()
          .includes(options.searchTerm.toLowerCase());
        const typeMatch = options.contentType
          ? asset.content_type === options.contentType
          : true;

        // Size filtering
        let sizeMatch = true;
        if (options.sizeFilter && options.sizeFilter !== "all") {
          const sizeFilterConfig = SIZE_FILTERS.find(
            (f) => f.key === options.sizeFilter
          );
          if (sizeFilterConfig && asset.size !== undefined && asset.size !== null) {
            const assetSize = asset.size;
            if (sizeFilterConfig.key === "empty") {
              sizeMatch = assetSize === 0;
            } else {
              sizeMatch =
                assetSize >= sizeFilterConfig.min &&
                assetSize <= sizeFilterConfig.max;
            }
          }
        }

        return nameMatch && typeMatch && sizeMatch;
      });
    },
    []
  );
  const folderFilesFiltered = useMemo(() => {
    return filterAssets(processedAssets, {
      searchTerm: assetSearchTerm || "",
      contentType: null,
      sizeFilter: sizeFilter
    });
  }, [filterAssets, processedAssets, assetSearchTerm, sizeFilter]);

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(currentFolderId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", currentFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    }
  });

  // Delete asset mutation
  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", currentFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    }
  });

  // Update asset mutation
  const updateAssetMutation = useMutation({
    mutationFn: (updateData: AssetUpdate) => update(updateData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", currentFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    }
  });

  // Navigate to folder
  const navigateToFolder = useCallback(
    async (folder: Asset | null) => {
      if (folder) {
        setSelectedFolderId(folder.id);
        setSelectedFolderIds(folder ? [folder.id] : []);
        setCurrentFolderId(folder.id || currentUser?.id || "");
        setCurrentFolder(folder || null);
        setSelectedAssetIds([]);
        loadCurrentFolder();
      }
    },
    [
      currentUser?.id,
      setCurrentFolderId,
      setSelectedFolderId,
      setSelectedFolderIds,
      setCurrentFolder,
      setSelectedAssetIds,
      loadCurrentFolder
    ]
  );
  // Navigate to folder id
  const navigateToFolderId = useCallback(
    async (folderId: string | null) => {
      const getAsset = useAssetStore.getState().get;
      const folder: Asset = await getAsset(folderId || "");

      if (folder) {
        setSelectedFolderId(folderId);
        setSelectedFolderIds(folderId ? [folderId] : []);
        setCurrentFolderId(folderId || currentUser?.id || "");
        setCurrentFolder(folder || null);
        setSelectedAssetIds([]);
        loadCurrentFolder();
      }
    },
    [
      setSelectedFolderId,
      setSelectedFolderIds,
      setCurrentFolderId,
      currentUser?.id,
      setCurrentFolder,
      setSelectedAssetIds,
      loadCurrentFolder
    ]
  );

  const isLoading = isLoadingCurrentFolder || isLoadingFolderTree;
  const error = currentFolderError || folderTreeError;

  const fetchAssetsRecursive = useCallback(
    async (folderId: string) => {
      const result = await load({
        parent_id: folderId,
        recursive: true
      });
      return result;
    },
    [load]
  );

  return {
    folderFiles: processedAssets, // Processed and sorted non-folder assets from the current folder
    folderFilesFiltered, // Filtered assets based on search term and content type
    folderAssets: currentFolderAssets, // Raw data returned from the API for the current folder, including both files and folders
    folderTree, // Tree structure of all folders in the system
    currentFolderId, // ID of the currently selected folder
    isLoading, // if assets are currently being loaded
    error, // error during asset fetching
    filterAssets, // filter assets based on search term and content type
    createFolder: createFolderMutation.mutate, // create a new folder
    deleteAsset: deleteAssetMutation.mutate, // delete an asset
    updateAsset: updateAssetMutation.mutate, // update an asset's properties
    navigateToFolder, // change the current folder
    navigateToFolderId, // change the current folder by id
    fetchAssets, // fetch assets for the current folder
    fetchAssetsRecursive, // fetch assets recursively
    refetchAssets, // invalidate and refetch assets for the current folder
    refetchFolders, // invalidate and refetch all folders
    refetchAssetsAndFolders // invalidate and refetch assets and folders
  };
};

export default useAssets;
