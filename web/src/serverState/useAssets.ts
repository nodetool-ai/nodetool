import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";
import { Asset } from "../stores/ApiTypes";
import { useSettingsStore } from "../stores/SettingsStore";

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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    initialFolderId
  );
  const {
    load,
    loadFolderTree,
    update,
    delete: deleteAsset,
    createFolder,
  } = useAssetStore();
  const { settings } = useSettingsStore();
  const queryClient = useQueryClient();

  // Fetch assets in the current folder
  const fetchAssets = useCallback(async () => {
    if (!currentFolderId) return [];
    const result = await load({ parent_id: currentFolderId });
    console.log("Fetched assets for folder:", currentFolderId, result.assets);
    return result.assets;
  }, [load, currentFolderId]);

  const {
    data: currentFolderAssets,
    error: currentFolderError,
    isLoading: isLoadingCurrentFolder,
  } = useQuery({
    queryKey: ["assets", currentFolderId],
    queryFn: fetchAssets,
    enabled: !!currentFolderId, // Only fetch if folderId is available
  });

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

  // Sort assets
  const sortAssets = useCallback((assetsToSort: Asset[], order: SortOrder) => {
    return [...assetsToSort].sort((a, b) => {
      if (order === "name") {
        return a.name.localeCompare(b.name);
      } else {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    });
  }, []);

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

  // Process assets (sort and separate folders/files)
  const processedAssets = useMemo(() => {
    if (!currentFolderAssets) return { folders: [], files: [] };
    const sortedAssets = sortAssets(currentFolderAssets, settings.assetsOrder);
    const folders = sortedAssets.filter(
      (asset) => asset.content_type === "folder"
    );
    const files = sortedAssets.filter(
      (asset) => asset.content_type !== "folder"
    );
    return { folders, files };
  }, [currentFolderAssets, sortAssets, settings.assetsOrder]);

  // Get filtered assets
  const getFilteredAssets = useCallback(
    (options: FilterOptions) => {
      const { folders, files } = processedAssets;
      return {
        folders: filterAssets(folders, options),
        files: filterAssets(files, options),
      };
    },
    [processedAssets, filterAssets]
  );

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
  const navigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
  }, []);

  const isLoading = isLoadingCurrentFolder || isLoadingFolderTree;
  const error = currentFolderError || folderTreeError;
  const refetchAssets = () =>
    queryClient.invalidateQueries({ queryKey: ["assets", currentFolderId] });
  const refetchFolderTree = () =>
    queryClient.invalidateQueries({ queryKey: ["folderTree"] });

  return {
    assets: processedAssets,
    folderTree,
    currentFolderId,
    isLoading,
    error,
    getFilteredAssets,
    createFolder: createFolderMutation.mutate,
    deleteAsset: deleteAssetMutation.mutate,
    updateAsset: updateAssetMutation.mutate,
    navigateToFolder,
    refetchAssets,
    refetchFolderTree,
  };
};

export default useAssets;
