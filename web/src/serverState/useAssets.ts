import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readAssetGenerationMetadata } from "@nodetool-ai/protocol";
import { useAssetStore } from "../stores/AssetStore";
import { Asset } from "../stores/ApiTypes";
import { useSettingsStore } from "../stores/SettingsStore";
import useAuth from "../stores/useAuth";
import {
  useAssetGridStore,
  useAssetGridStoreApi
} from "../stores/AssetGridStore";
import { SIZE_FILTERS } from "../utils/formatUtils";
import { getAssetCategory } from "../components/assets/assetGridUtils";
import { trpcClient } from "../trpc/client";
import { normalizeAssetList } from "../utils/normalizeAsset";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";

type FilterOptions = {
  searchTerm: string;
  contentType?: string | null;
  sizeFilter?: string;
  typeFilter?: string;
  modelFilter?: string | null;
};

/** A model that produced at least one asset in the current view. */
export type AssetModelOption = {
  /** Model id, as stamped in the asset's generation metadata. */
  id: string;
  /** Display name when the generator recorded one, else the id. */
  label: string;
};

/** The model that generated an asset, from its generation metadata. */
const assetModel = (asset: Asset): AssetModelOption | null => {
  const generation = readAssetGenerationMetadata(asset.metadata).generation;
  if (!generation?.model) {
    return null;
  }
  return {
    id: generation.model,
    label: generation.model_name ?? generation.model
  };
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

export const useAssets = () => {
  const gridStore = useAssetGridStoreApi();
  const setCurrentFolderId = useAssetGridStore(
    (state) => state.setCurrentFolderId
  );
  const currentFolderId = useAssetGridStore((state) => state.currentFolderId);
  const currentUser = useAuth((state) => state.user);
  const setCurrentFolder = useAssetGridStore((state) => state.setCurrentFolder);
  const loadCurrentFolder = useAssetStore((state) => state.loadCurrentFolder);
  const load = useAssetStore((state) => state.load);
  const loadFolderTree = useAssetStore((state) => state.loadFolderTree);
  const update = useAssetStore((state) => state.update);
  const deleteAsset = useAssetStore((state) => state.delete);
  const createFolder = useAssetStore((state) => state.createFolder);
  const settings = useSettingsStore((state) => state.settings);
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
  const typeFilter = useAssetGridStore((state) => state.typeFilter);
  const workflowFilter = useAssetGridStore((state) => state.workflowFilter);
  const favoritesOnly = useAssetGridStore((state) => state.favoritesOnly);
  const modelFilter = useAssetGridStore((state) => state.modelFilter);
  const gridScopeProjectId = useAssetGridStore(
    (state) => state.scopeProjectId
  );
  const resetForProject = useAssetGridStore((state) => state.resetForProject);
  const activeProjectId = useWorkspaceTabsStore(
    (state) =>
      state.activeProjectId ?? state.personalProjectId ?? LOOSE_PROJECT_ID
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  // A workflow scope or the Favorites view lists across folders.
  const isFilteredScope = Boolean(workflowFilter) || favoritesOnly;
  const filteredScopeKey = useMemo(
    () => ({
      workflow_id: workflowFilter ?? undefined,
      favorite: favoritesOnly || undefined,
      project_id: activeProjectId
    }),
    [workflowFilter, favoritesOnly, activeProjectId]
  );

  if (currentUser === null) {
    throw new Error("User not logged");
  }

  const projectScopeReady = gridScopeProjectId === activeProjectId;

  useEffect(() => {
    if (!projectScopeReady) {
      resetForProject(activeProjectId);
    }
  }, [activeProjectId, projectScopeReady, resetForProject]);

  const fetchAssets = useCallback(async () => {
    const result = await load({
      parent_id: currentFolderId || currentUser.id,
      project_id: activeProjectId
    });
    return result;
  }, [load, currentFolderId, currentUser.id, activeProjectId]);

  const {
    data: currentFolderAssets,
    error: currentFolderError,
    isLoading: isLoadingCurrentFolder
  } = useQuery({
    queryKey: [
      "assets",
      { parent_id: currentFolderId, project_id: activeProjectId }
    ],
    queryFn: fetchAssets,
    enabled: projectScopeReady && !!currentFolderId && !isFilteredScope,
    staleTime: 30_000
  });

  // Fetch across folders when a workflow scope or the Favorites view is active
  const fetchFilteredAssets = useCallback(async () => {
    const data = await trpcClient.assets.list.query(filteredScopeKey);
    return {
      ...data,
      assets: normalizeAssetList(data.assets)
    };
  }, [filteredScopeKey]);

  const {
    data: filteredScopeAssets,
    error: filteredScopeError,
    isLoading: isLoadingFilteredScope
  } = useQuery({
    queryKey: ["assets", filteredScopeKey],
    queryFn: fetchFilteredAssets,
    enabled: projectScopeReady && isFilteredScope,
    staleTime: 30000
  });

  const refetchAssets = useCallback(() => {
    if (isFilteredScope) {
      return queryClient.invalidateQueries({
        queryKey: ["assets", filteredScopeKey]
      });
    }
    return queryClient.invalidateQueries({
      queryKey: [
        "assets",
        { parent_id: currentFolderId, project_id: activeProjectId }
      ]
    });
  }, [
    queryClient,
    currentFolderId,
    isFilteredScope,
    filteredScopeKey,
    activeProjectId
  ]);

  const fetchAllFolders = useCallback(async () => {
    return await loadFolderTree(settings.assetsOrder, activeProjectId);
  }, [loadFolderTree, settings.assetsOrder, activeProjectId]);

  const {
    data: folderTree,
    error: folderTreeError,
    isLoading: isLoadingFolderTree
  } = useQuery({
    queryKey: ["folderTree", settings.assetsOrder, activeProjectId],
    queryFn: fetchAllFolders
  });

  const refetchFolders = useCallback(() => {
    return queryClient.invalidateQueries({
      queryKey: ["folderTree", settings.assetsOrder, activeProjectId]
    });
  }, [queryClient, settings.assetsOrder, activeProjectId]);

  const refetchAssetsAndFolders = useCallback(() => {
    refetchAssets();
    refetchFolders();
  }, [refetchAssets, refetchFolders]);

  const processedAssets = useMemo(() => {
    const sourceAssets = isFilteredScope
      ? (filteredScopeAssets?.assets as Asset[] | undefined)
      : currentFolderAssets?.assets;

    if (!sourceAssets) {return [];}

    const nonFolderAssets = sourceAssets.filter(
      (asset) => asset.content_type !== "folder"
    );

    // Sort by the user's preferred order (views handle grouping by type)
    return [...nonFolderAssets].sort((a, b) => {
      if (settings.assetsOrder === "name") {
        return a.name.localeCompare(b.name);
      } else if (settings.assetsOrder === "date") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (settings.assetsOrder === "size") {
        const aSize = a.size;
        const bSize = b.size;
        if (aSize != null && bSize != null) {
          return bSize - aSize;
        }
        return a.name.localeCompare(b.name);
      } else {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    });
  }, [currentFolderAssets, filteredScopeAssets, isFilteredScope, settings.assetsOrder]);

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
          if (sizeFilterConfig && asset.size != null) {
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

        // Asset-category filtering (image / video / audio / etc.)
        let categoryMatch = true;
        if (options.typeFilter && options.typeFilter !== "all") {
          const category = getAssetCategory(asset.content_type || "");
          categoryMatch = category === options.typeFilter;
        }

        const modelMatch = options.modelFilter
          ? assetModel(asset)?.id === options.modelFilter
          : true;

        return (
          nameMatch && typeMatch && sizeMatch && categoryMatch && modelMatch
        );
      });
    },
    []
  );
  const folderFilesFiltered = useMemo(() => {
    return filterAssets(processedAssets, {
      searchTerm: assetSearchTerm || "",
      contentType: null,
      sizeFilter: sizeFilter,
      typeFilter: typeFilter,
      modelFilter: modelFilter
    });
  }, [
    filterAssets,
    processedAssets,
    assetSearchTerm,
    sizeFilter,
    typeFilter,
    modelFilter
  ]);

  // The models behind the assets in view, for the model filter menu.
  const modelOptions = useMemo(() => {
    const byId = new Map<string, AssetModelOption>();
    for (const asset of processedAssets) {
      const model = assetModel(asset);
      if (model && !byId.has(model.id)) {
        byId.set(model.id, model);
      }
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [processedAssets]);

  // AssetStore.{createFolder,delete,update} already invalidates the
  // ["assets", { parent_id }] queries it touches; these mutations only need
  // to refresh the folder tree and the workflow-filtered list.
  const invalidateAssetSiblings = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [
        "assets",
        { parent_id: currentFolderId, project_id: activeProjectId }
      ]
    });
    if (isFilteredScope) {
      queryClient.invalidateQueries({ queryKey: ["assets", filteredScopeKey] });
    }
    queryClient.invalidateQueries({ queryKey: ["folderTree"] });
  }, [queryClient, currentFolderId, isFilteredScope, filteredScopeKey, activeProjectId]);

  const notifyMutationError = useCallback(
    (content: string) => (err: Error) => {
      console.error(content, err);
      addNotification({
        type: "error",
        alert: true,
        content,
        dismissable: false
      });
    },
    [addNotification]
  );

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      createFolder(currentFolderId, name, activeProjectId),
    onSuccess: invalidateAssetSiblings,
    onError: notifyMutationError("Error creating folder.")
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: invalidateAssetSiblings,
    onError: notifyMutationError("Error deleting asset.")
  });

  const updateAssetMutation = useMutation({
    mutationFn: (updateData: AssetUpdate) => update(updateData),
    onSuccess: invalidateAssetSiblings,
    onError: notifyMutationError("Error updating asset.")
  });

  const navigateToFolder = useCallback(
    async (folder: Asset | null) => {
      if (folder) {
        setSelectedFolderId(folder.id);
        setSelectedFolderIds(folder ? [folder.id] : []);
        setCurrentFolderId(folder.id || currentUser?.id || "");
        setCurrentFolder(folder || null);
        setSelectedAssetIds([]);
        loadCurrentFolder(gridStore, activeProjectId);
      }
    },
    [
      currentUser?.id,
      setCurrentFolderId,
      setSelectedFolderId,
      setSelectedFolderIds,
      setCurrentFolder,
      setSelectedAssetIds,
      loadCurrentFolder,
      gridStore,
      activeProjectId
    ]
  );
  const navigateToFolderId = useCallback(
    async (folderId: string | null) => {
      const getAsset = useAssetStore.getState().get;
      const folder: Asset = await getAsset(folderId || "", activeProjectId);

      if (folder) {
        setSelectedFolderId(folderId);
        setSelectedFolderIds(folderId ? [folderId] : []);
        setCurrentFolderId(folderId || currentUser?.id || "");
        setCurrentFolder(folder || null);
        setSelectedAssetIds([]);
        loadCurrentFolder(gridStore, activeProjectId);
      }
    },
    [
      setSelectedFolderId,
      setSelectedFolderIds,
      setCurrentFolderId,
      currentUser?.id,
      setCurrentFolder,
      setSelectedAssetIds,
      loadCurrentFolder,
      gridStore,
      activeProjectId
    ]
  );

  const isLoading = isFilteredScope
    ? isLoadingFilteredScope
    : (isLoadingCurrentFolder || isLoadingFolderTree);
  const error = isFilteredScope
    ? filteredScopeError
    : (currentFolderError || folderTreeError);

  const fetchAssetsRecursive = useCallback(
    async (folderId: string) => {
      const result = await load({
        parent_id: folderId,
        project_id: activeProjectId,
        recursive: true
      });
      return result;
    },
    [load, activeProjectId]
  );

  return {
    folderFiles: processedAssets, // Processed and sorted non-folder assets from the current folder
    folderFilesFiltered, // Filtered assets based on search term and content type
    folderAssets: currentFolderAssets, // Raw data returned from the API for the current folder, including both files and folders
    folderTree, // Tree structure of all folders in the system
    modelOptions, // models that generated the assets in view
    projectId: activeProjectId,
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
