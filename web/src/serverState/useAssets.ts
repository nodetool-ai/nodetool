import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";
import { Asset } from "../stores/ApiTypes";
import { useSettingsStore } from "../stores/SettingsStore";
import useSessionStateStore from "../stores/SessionStateStore";

type SortOrder = "name" | "date";
type FilterOptions = {
  searchTerm: string;
  contentType?: string | null;
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

export const useAssets = (initialFolderId: string | null = null) => {
  const setCurrentFolderId = useAssetStore((state) => state.setCurrentFolderId);

  const currentFolderId = useAssetStore((state) => state.currentFolderId);

  const {
    load,
    loadFolderTree,
    update,
    delete: deleteAsset,
    createFolder,
  } = useAssetStore();
  const { settings } = useSettingsStore();
  const queryClient = useQueryClient();
  const setSelectedFolderId = useSessionStateStore(
    (state) => state.setSelectedFolderId
  );
  const setSelectedFolderIds = useSessionStateStore(
    (state) => state.setSelectedFolderIds
  );
  const assetSearchTerm = useSessionStateStore(
    (state) => state.assetSearchTerm
  );

  // Fetch assets in the current folder
  const fetchAssets = useCallback(async () => {
    const result = await load({ parent_id: currentFolderId || "1" });
    return result;
  }, [load, currentFolderId]);
  const {
    data: currentFolderAssets,
    error: currentFolderError,
    isLoading: isLoadingCurrentFolder,
  } = useQuery({
    queryKey: ["assets", currentFolderId],
    queryFn: fetchAssets,
    enabled: !!currentFolderId,
  });

  const refetchAssets = useCallback(() => {
    return queryClient.invalidateQueries({
      queryKey: ["assets", currentFolderId],
    });
  }, [queryClient, currentFolderId]);

  // Fetch all folders
  const fetchAllFolders = useCallback(async () => {
    return await loadFolderTree(settings.assetsOrder);
  }, [loadFolderTree, settings.assetsOrder]);

  const {
    data: folderTree,
    error: folderTreeError,
    isLoading: isLoadingFolderTree,
  } = useQuery({
    queryKey: ["folderTree", settings.assetsOrder],
    queryFn: fetchAllFolders,
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
    if (!currentFolderAssets || !currentFolderAssets.assets) return [];

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
        return nameMatch && typeMatch;
      });
    },
    []
  );
  const folderFilesFiltered = useMemo(() => {
    return filterAssets(processedAssets, {
      searchTerm: assetSearchTerm || "",
      contentType: null,
    });
  }, [filterAssets, processedAssets, assetSearchTerm]);

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(currentFolderId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", currentFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    },
  });

  // Delete asset mutation
  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", currentFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    },
  });

  // Update asset mutation
  const updateAssetMutation = useMutation({
    mutationFn: (updateData: AssetUpdate) => update(updateData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", currentFolderId] });
      queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    },
  });

  // Navigate to folder
  const navigateToFolder = useCallback(
    (folderId: string | null) => {
      setSelectedFolderId(folderId);
      setSelectedFolderIds(folderId ? [folderId] : []);
      setCurrentFolderId(folderId || "1");
    },
    [setCurrentFolderId, setSelectedFolderId, setSelectedFolderIds]
  );

  const isLoading = isLoadingCurrentFolder || isLoadingFolderTree;
  const error = currentFolderError || folderTreeError;

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
    fetchAssets, // fetch assets for the current folder
    refetchAssets, // invalidate and refetch assets for the current folder
    refetchFolders, // invalidate and refetch all folders
    refetchAssetsAndFolders, // invalidate and refetch assets and folders
  };
};

export default useAssets;
