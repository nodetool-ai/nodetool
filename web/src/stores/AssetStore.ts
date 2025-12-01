import { create } from "zustand";
import { client, authHeader } from "./ApiClient";
import { BASE_URL } from "./BASE_URL";
import { Asset, AssetList, AssetSearchResult } from "./ApiTypes";
import log from "loglevel";
import { QueryClient, QueryKey } from "@tanstack/react-query";
import axios from "axios";
import { useAssetGridStore } from "./AssetGridStore";
import { AppError, createErrorMessage } from "../utils/errorHandling";
import type { components } from "../api";

type AssetCreatePayload = {
  workflow_id?: string;
  parent_id?: string | null;
  content_type?: string | null;
  name?: string;
};

type UploadProgressEvent = {
  loaded: number;
  total: number;
  lengthComputable: boolean;
};

const normalizeAssetError = (error: unknown, message: string) => {
  if (error instanceof AppError) {
    throw error;
  }
  throw createErrorMessage(error, message);
};

const emitUploadProgress = (
  onUploadProgress: ((progressEvent: UploadProgressEvent) => void) | undefined,
  loaded: number,
  total: number
) => {
  if (!onUploadProgress) return;
  onUploadProgress({
    loaded,
    total,
    lengthComputable: true
  });
};

const uploadAsset = async (
  payload: AssetCreatePayload,
  file?: File,
  onUploadProgress?: (progressEvent: UploadProgressEvent) => void,
  errorMessage = "Failed to create asset"
): Promise<Asset> => {
  const formData = new FormData();
  formData.append("json", JSON.stringify(payload));

  if (file) {
    formData.append("file", file);
  }

  // Provide basic progress feedback even though fetch-based uploads
  // don't stream progress events.
  const total = file?.size ?? 1;
  emitUploadProgress(onUploadProgress, 0, total);

  try {
    const { data, error } = await client.POST("/api/assets/", {
      body: formData as unknown as components["schemas"]["Body_create_api_assets__post"]
    });

    if (error) {
      throw error;
    }

    emitUploadProgress(onUploadProgress, total, total);
    return data as Asset;
  } catch (error) {
    const statusCode = (error as { status?: number })?.status;
    const normalizedError =
      error instanceof DOMException && error.name === "AbortError"
        ? createErrorMessage(error, "Asset upload was cancelled")
        : error instanceof TypeError
        ? createErrorMessage(error, "Network error while creating asset")
        : statusCode === 408
        ? createErrorMessage(error, "Asset upload timed out")
        : createErrorMessage(error, errorMessage);

    throw normalizedError;
  }
};

export type AssetQuery = {
  cursor?: string;
  workflow_id?: string | null;
  parent_id?: string | null;
  content_type?: string | null;
  recursive?: boolean;
};

export type AssetSearchQuery = {
  query: string;
  content_type?: string;
  page_size?: number;
  cursor?: string;
};

export type AssetUpdate = {
  id: string;
  status?: string;
  name?: string;
  parent_id?: string;
  content_type?: string;
  metadata?: Record<string, never>;
  data?: string;
  duration?: number;
};

export interface AssetStore {
  queryClient: QueryClient | null;
  setQueryClient: (queryClient: QueryClient) => void;
  add: (asset: Asset) => void;
  invalidateQueries: (queryKey: QueryKey) => void;
  get: (id: string) => Promise<Asset>;
  getAllAssetsInFolder: (folderId: string) => Promise<Asset[]>;
  createFolder: (parent_id: string | null, name: string) => Promise<Asset>;
  createAsset: (
    file: File,
    workflow_id?: string,
    parent_id?: string,
    onUploadProgress?: (progressEvent: UploadProgressEvent) => void
  ) => Promise<Asset>;
  load: (query: AssetQuery) => Promise<AssetList>;
  loadFolderTree: (sortBy?: string) => Promise<FolderTree>;
  loadCurrentFolder: (cursor?: string) => Promise<AssetList>;
  loadFolderById: (id: string) => Promise<AssetList>;
  search: (query: AssetSearchQuery) => Promise<AssetSearchResult>;
  update: (asset: AssetUpdate) => Promise<Asset>;
  delete: (id: string) => Promise<string[]>;
  download: (ids: string[]) => Promise<boolean>;
  getAssetsRecursive: (folderId: string) => Promise<AssetTreeNode[]>;
}

/**
 * Sort assets by created_at in descending order.
 */
const sort = (assets: { [key: string]: Asset }) => {
  return Object.values(assets).sort((a, b) => {
    return -a.created_at.localeCompare(b.created_at);
  });
};

type FolderTree = Record<string, AssetTreeNode>;

const buildFolderTree = (
  folders: Asset[],
  sortBy: "name" | "updated_at" = "name"
): FolderTree => {
  const tree: FolderTree = {};
  const lookup: Record<string, AssetTreeNode> = {};

  folders.forEach((folder) => {
    lookup[folder.id] = { ...folder, children: [] };
  });

  folders.forEach((folder) => {
    if (folder.parent_id && lookup[folder.parent_id]) {
      lookup[folder.parent_id].children.push(lookup[folder.id]);
    } else {
      tree[folder.id] = lookup[folder.id];
    }
  });

  const sortNodes = (a: AssetTreeNode, b: AssetTreeNode) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    } else if (sortBy === "updated_at") {
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    return 0;
  };

  const sortChildren = (node: AssetTreeNode) => {
    node.children.sort(sortNodes);
    node.children.forEach(sortChildren);
  };

  // Convert tree object to array, sort, and convert back to object
  const sortedTreeArray = Object.values(tree).sort(sortNodes);
  const sortedTree: FolderTree = {};
  sortedTreeArray.forEach((node) => {
    sortedTree[node.id] = node;
  });

  Object.values(sortedTree).forEach(sortChildren);

  return sortedTree;
};

interface AssetTreeResponse {
  assets: AssetTreeNode[];
}

interface AssetTreeNode extends Asset {
  children?: AssetTreeNode[];
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  queryClient: null,
  currentFolderId: null,
  currentFolder: null,
  parentFolder: null,

  /**
   * Set the react query client to allow clearing the cache.
   */
  setQueryClient: (queryClient: QueryClient) => {
    set({ queryClient });
  },

  /**
   * Clear the cache for a given query.
   */
  invalidateQueries: (queryKey: QueryKey) => {
    get().queryClient?.invalidateQueries({ queryKey: queryKey });
  },

  /**
   * Add an asset to the cache.
   */
  add: (asset: Asset) => {
    get().queryClient?.setQueryData(["assets", asset.id], asset);
  },

  /**
   * Get an asset by ID from the server.
   *
   * @param id The ID of the asset to get.
   * @returns A promise that resolves to the asset.
   */
  get: async (id: string) => {
    const { data, error } = await client.GET("/api/assets/{id}", {
      params: { path: { id } }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load asset");
    }
    get().add(data);
    return data;
  },

  /**
   * Load assets from the server.
   *
   * @param query The asset query to use to load assets.
   * @returns A promise that resolves to the loaded assets.
   */
  // Adjusting the load function to correctly handle the query
  load: async (query: AssetQuery) => {
    const { data, error } = await client.GET("/api/assets/", {
      params: {
        query: query
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load assets");
    }
    for (const asset of data.assets) {
      get().add(asset);
    }
    return data;
  },

  /**
   * Load all folders as a tree
   */

  loadFolderTree: async (sortBy?: string) => {
    // Fallback implementation: fetch all folders via /api/assets/ and build tree locally
    const { data, error } = await client.GET("/api/assets/", {
      params: { query: { content_type: "folder" } }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load folder tree");
    }
    return buildFolderTree(
      data.assets as unknown as Asset[],
      sortBy === "updated_at" ? "updated_at" : "name"
    );
  },

  /**
   * Load the current folder and its parent folder.
   */
  loadCurrentFolder: async (cursor?: string) => {
    const currentFolderId = useAssetGridStore.getState().currentFolderId;
    const setCurrentFolder = useAssetGridStore.getState().setCurrentFolder;
    const setParentFolder = useAssetGridStore.getState().setParentFolder;
    if (currentFolderId) {
      const asset = await get().get(currentFolderId);
      setCurrentFolder(asset);
      if (asset?.parent_id !== "") {
        get()
          .get(asset.parent_id)
          .then((parent) => {
            setParentFolder(parent);
          });
      }
    }
    return get().load({ parent_id: currentFolderId, cursor: cursor || "" });
  },

  /**
   * Load a specific folder by its ID.
   *
   * @param id The ID of the folder to load.
   * @returns A promise that resolves to the loaded folder's assets.
   */
  loadFolderById: async (id: string) => {
    return get().load({ parent_id: id });
  },

  /**
   * Search assets globally with folder path information.
   *
   * @param query The search query parameters.
   * @returns A promise that resolves to the search results.
   */
  search: async (query: AssetSearchQuery): Promise<AssetSearchResult> => {
    try {
      const headers = await authHeader();
      const params = new URLSearchParams();
      params.append("query", query.query);
      if (query.content_type) params.append("content_type", query.content_type);
      if (query.page_size)
        params.append("page_size", query.page_size.toString());
      if (query.cursor) params.append("cursor", query.cursor);

      const response = await axios.get(
        `${BASE_URL}/api/assets/search?${params.toString()}`,
        { headers }
      );

      return response.data as AssetSearchResult;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw createErrorMessage(
          error.response?.data,
          "Failed to search assets"
        );
      }
      throw new Error("Failed to search assets");
    }
  },

  /**
   * Create a folder on the server.
   * Folders are assets with content_type "folder".
   * The root folder has parent_id = "0" and the
   * same ID as the owning user.
   *
   * @param parent_id The ID of the parent asset.
   * @param name The name of the folder.
   */
  createFolder: async (parent_id: string | null, name: string) => {
    try {
      const folder = await uploadAsset(
        {
          parent_id,
          content_type: "folder",
          name
        },
        undefined,
        undefined,
        "Failed to create folder"
      );
      get().add(folder);
      get().invalidateQueries(["assets", { parent_id: parent_id }]);
      // Also invalidate the folder list so components like FolderProperty refresh
      get().invalidateQueries(["assets", { content_type: "folder" }]);
      return folder;
    } catch (error) {
      throw normalizeAssetError(error, "Failed to create folder");
    }
  },
  /**
   * Get all assets in a folder, including subfolders.
   *
   * @param folderId The ID of the folder to get assets from.
   * @returns A promise that resolves to the assets in the folder.
   */
  getAllAssetsInFolder: async (folderId: string): Promise<Asset[]> => {
    const assets: Asset[] = [];
    const queue: string[] = [folderId];

    while (queue.length > 0) {
      const currentFolderId = queue.shift()!;
      const { data, error } = await client.GET("/api/assets/", {
        params: { query: { parent_id: currentFolderId } }
      });

      if (error) {
        throw createErrorMessage(error, "Failed to load assets in folder");
      }
      const assetList = data as { assets: Asset[] };
      for (const asset of assetList.assets) {
        assets.push(asset);
        if (asset.content_type === "folder") {
          queue.push(asset.id);
        }
      }
    }

    return assets;
  },
  /**
   * Delete an asset from the store and the server.
   *
   * @param id The ID of the asset to delete.
   * @returns A promise that resolves when the asset is deleted.
   */
  delete: async (id: string): Promise<string[]> => {
    const { data, error } = await client.DELETE("/api/assets/{id}", {
      params: { path: { id } }
    });

    if (error) {
      throw createErrorMessage(error, "Failed to delete asset");
    }

    const response = data as { deleted_asset_ids: string[] };
    const deletedAssetIds = response.deleted_asset_ids;

    deletedAssetIds.forEach((assetId) => {
      get().invalidateQueries(["assets", assetId]);
      get().invalidateQueries(["assets", { parent_id: assetId }]);
    });
    return deletedAssetIds;
  },

  /**
   * Download assets from the server.
   *
   * @param ids An array of asset IDs to download.
   * @returns A promise that resolves when the download is complete.
   */

  download: async (ids: string[]): Promise<boolean> => {
    log.info(`[AssetStore] Attempting to download assets: ${ids.join(", ")}`);
    try {
      const headers = await authHeader();

      const url = `${BASE_URL}/api/assets/download`;

      const response = await axios({
        url: url,
        method: "POST",
        headers,
        data: {
          asset_ids: ids
        },
        responseType: "arraybuffer"
      });

      const filename = response.headers["content-disposition"]
        ? response.headers["content-disposition"].split("filename=")[1]
        : "assets.zip";

      // Check for Electron's API (could be window.electron or window.api)
      type ElectronSaveFile = (
        data: ArrayBuffer,
        filename: string,
        filters?: { name: string; extensions: string[] }[]
      ) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;

      const electronApi =
        (window as unknown as {
          electron?: { saveFile?: ElectronSaveFile };
          api?: { saveFile?: ElectronSaveFile };
        }).electron ||
        (window as unknown as { api?: { saveFile?: ElectronSaveFile } }).api;

      if (electronApi?.saveFile) {
        const result = await electronApi.saveFile(response.data, filename, [
          { name: "ZIP Files", extensions: ["zip"] }
        ]);
        if (!result.success && !result.canceled) {
          throw new Error(result.error || "Failed to save file");
        }
      } else {
        // Browser fallback
        const blob = new Blob([response.data], {
          type: response.headers["content-type"]
        });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }

      get().invalidateQueries(["assets"]);
      return true;
    } catch (error) {
      log.error(
        "[AssetStore] CATCH BLOCK: An error occurred during download.",
        error
      );
      if (axios.isAxiosError(error)) {
        log.error("[AssetStore] Axios error details:", {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          data: error.response?.data
        });
        if (error.response?.data instanceof ArrayBuffer) {
          try {
            const errorMessage = JSON.parse(
              new TextDecoder().decode(error.response.data)
            );
            log.error(
              "[AssetStore] Decoded server error message:",
              errorMessage
            );
          } catch (e) {
            log.error(
              "[AssetStore] Could not parse error response from ArrayBuffer:",
              e
            );
          }
        }
      }
      throw error;
    }
  },

  /**
   * Update an asset on the server.
   *
   */
  update: async (req: AssetUpdate) => {
    const prev = await get().get(req.id);
    if (req.id === req.parent_id) {
      throw new Error("Cannot move an asset into itself.");
    }
    const { error, data } = await client.PUT("/api/assets/{id}", {
      params: { path: { id: req.id } },
      body: {
        name: req.name || null,
        parent_id: req.parent_id || null,
        content_type: req.content_type || null,
        metadata: req.metadata || null,
        data: req.data || null
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to update asset");
    }
    get().add(data);
    get().invalidateQueries(["assets", { parent_id: prev.parent_id }]);
    if (req.parent_id !== prev.parent_id) {
      get().invalidateQueries(["assets", { parent_id: req.parent_id }]);
    }
    return data;
  },

  /**
   * Create an asset on the server.
   *
   * @param file The file to create an asset from.
   * @returns A promise that resolves to the created asset.
   */
  createAsset: async (
    file: File,
    workflow_id?: string,
    parent_id?: string,
    onUploadProgress?: (progressEvent: UploadProgressEvent) => void
  ) => {
    try {
      const asset = await uploadAsset(
        {
          workflow_id: workflow_id,
          parent_id: parent_id,
          content_type: file.type,
          name: file.name
        },
        file,
        onUploadProgress
      );
      get().invalidateQueries(["assets", { parent_id: asset.parent_id }]);
      get().add(asset);
      return asset;
    } catch (error) {
      throw normalizeAssetError(error, "Failed to create asset");
    }
  },

  getAssetsRecursive: async (folderId: string): Promise<AssetTreeNode[]> => {
    const { data, error } = await client.GET(
      "/api/assets/{folder_id}/recursive",
      {
        params: { path: { folder_id: folderId } }
      }
    );
    if (error) {
      throw createErrorMessage(error, "Failed to load assets recursively");
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "assets" in data &&
      Array.isArray(data.assets)
    ) {
      return (data as AssetTreeResponse).assets;
    } else {
      log.error("AssetStore: Unexpected data structure received:", data);
      throw new Error("Unexpected data structure received from server");
    }
  }
}));
