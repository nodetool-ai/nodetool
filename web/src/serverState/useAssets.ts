import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readAssetGenerationMetadata } from "@nodetool-ai/protocol";
import { useAssetStore } from "../stores/AssetStore";
import { Asset } from "../stores/ApiTypes";
import { useSettingsStore } from "../stores/SettingsStore";
import useAuth from "../stores/useAuth";
import { useAssetGridStore } from "../stores/AssetGridStore";
import { SIZE_FILTERS } from "../utils/formatUtils";
import {
  countAssetGroups,
  getAssetGroup
} from "../components/assets/assetGridUtils";
import { trpcClient } from "../trpc/client";
import { normalizeAssetList } from "../utils/normalizeAsset";
import { useNotificationStore } from "../stores/NotificationStore";
import { useAssetProjectScope } from "../hooks/assets/useAssetProjectScope";

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
  const currentUser = useAuth((state) => state.user);
  const load = useAssetStore((state) => state.load);
  const update = useAssetStore((state) => state.update);
  const deleteAsset = useAssetStore((state) => state.delete);
  const settings = useSettingsStore((state) => state.settings);
  const queryClient = useQueryClient();
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
  const {
    projectId: scopeProjectId,
    scopeKey,
    activeProjectId
  } = useAssetProjectScope();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  // A workflow scope or the Favorites view narrows the listing on the server.
  const isFilteredScope = Boolean(workflowFilter) || favoritesOnly;
  const filteredScopeKey = useMemo(
    () => ({
      workflow_id: workflowFilter ?? undefined,
      favorite: favoritesOnly || undefined,
      project_id: scopeProjectId
    }),
    [workflowFilter, favoritesOnly, scopeProjectId]
  );
  // The library lists every asset of the project, in every directory.
  const libraryKey = useMemo(
    () => ({ library: true, project_id: scopeProjectId }),
    [scopeProjectId]
  );

  if (currentUser === null) {
    throw new Error("User not logged");
  }

  const projectScopeReady = gridScopeProjectId === scopeKey;

  useEffect(() => {
    if (!projectScopeReady) {
      resetForProject(scopeKey);
    }
  }, [scopeKey, projectScopeReady, resetForProject]);

  // Uploads land in the listed project, or across every project in the
  // workspace's project.
  const writeProjectId = scopeProjectId ?? activeProjectId;

  // `assets.recursive` from the home folder walks the whole project folder.
  const fetchLibraryAssets = useCallback(async () => {
    const query: Parameters<typeof load>[0] = {
      parent_id: currentUser.id,
      recursive: true
    };
    if (scopeProjectId !== undefined) {
      query.project_id = scopeProjectId;
    }
    return load(query);
  }, [load, currentUser.id, scopeProjectId]);

  const {
    data: libraryAssets,
    error: libraryError,
    isLoading: isLoadingLibrary
  } = useQuery({
    queryKey: ["assets", libraryKey],
    queryFn: fetchLibraryAssets,
    enabled: projectScopeReady && !isFilteredScope,
    staleTime: 30_000
  });

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
    return queryClient.invalidateQueries({
      queryKey: ["assets", isFilteredScope ? filteredScopeKey : libraryKey]
    });
  }, [queryClient, isFilteredScope, filteredScopeKey, libraryKey]);

  const processedAssets = useMemo(() => {
    const sourceAssets = isFilteredScope
      ? (filteredScopeAssets?.assets as Asset[] | undefined)
      : libraryAssets?.assets;

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
  }, [libraryAssets, filteredScopeAssets, isFilteredScope, settings.assetsOrder]);

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

        // Type-group filtering (image / video / audio / etc.)
        let categoryMatch = true;
        if (options.typeFilter && options.typeFilter !== "all") {
          categoryMatch =
            getAssetGroup(asset.content_type || "") === options.typeFilter;
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
  // Every filter except the type, so the type filter can count each group.
  const folderFilesAnyType = useMemo(() => {
    return filterAssets(processedAssets, {
      searchTerm: assetSearchTerm || "",
      contentType: null,
      sizeFilter: sizeFilter,
      modelFilter: modelFilter
    });
  }, [filterAssets, processedAssets, assetSearchTerm, sizeFilter, modelFilter]);

  const folderFilesFiltered = useMemo(() => {
    if (typeFilter === "all") {
      return folderFilesAnyType;
    }
    return folderFilesAnyType.filter(
      (asset) => getAssetGroup(asset.content_type || "") === typeFilter
    );
  }, [folderFilesAnyType, typeFilter]);

  // Assets per type group under the other filters, for the type filter chips.
  const typeCounts = useMemo(
    () => countAssetGroups(folderFilesAnyType),
    [folderFilesAnyType]
  );

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

  // AssetStore.{delete,update} invalidate the per-folder keys; the library
  // and filtered listings need their own refresh.
  const invalidateAssetSiblings = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["assets", libraryKey] });
    if (isFilteredScope) {
      queryClient.invalidateQueries({ queryKey: ["assets", filteredScopeKey] });
    }
  }, [queryClient, libraryKey, isFilteredScope, filteredScopeKey]);

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

  const isLoading = isFilteredScope ? isLoadingFilteredScope : isLoadingLibrary;
  const error = isFilteredScope ? filteredScopeError : libraryError;

  return {
    folderFiles: processedAssets, // sorted non-folder assets in scope
    folderFilesFiltered, // assets under the search, size, type and model filters
    typeCounts, // Assets per type group under every filter but the type
    modelOptions, // models that generated the assets in view
    projectId: writeProjectId,
    isLoading, // if assets are currently being loaded
    error, // error during asset fetching
    filterAssets, // filter assets based on search term and content type
    deleteAsset: deleteAssetMutation.mutate, // delete an asset
    updateAsset: updateAssetMutation.mutate, // update an asset's properties
    refetchAssets // invalidate and refetch the listed assets
  };
};

export default useAssets;
