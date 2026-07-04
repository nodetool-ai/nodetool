/** AssetStore manages file assets and folder organization. */

import { create } from "zustand";
import { authHeader } from "../lib/auth";
import { restFetch } from "../lib/rest-fetch";
import { BASE_URL } from "./BASE_URL";
import { trpcClient } from "../trpc/client";
import { Asset, AssetList, AssetSearchResult } from "./ApiTypes";
import { QueryClient, QueryKey } from "@tanstack/react-query";
import type { AssetGridStoreApi } from "./AssetGridStore";
import { AppError, createErrorMessage } from "../utils/errorHandling";
import {
  prepareUploadFile,
  UploadValidationError,
  UploadSource
} from "../utils/imageUploadValidation";
import { normalizeAssetUrls, normalizeAssetList } from "../utils/normalizeAsset";

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
  if (typeof AppError === "function" && error instanceof AppError) {
    throw error;
  }
  if (error instanceof UploadValidationError) {
    throw error;
  }
  const normalized = createErrorMessage(error, message);
  if (normalized instanceof Error) {
    throw normalized;
  }
  throw new Error(message);
};

const emitUploadProgress = (
  onUploadProgress: ((progressEvent: UploadProgressEvent) => void) | undefined,
  loaded: number,
  total: number
) => {
  if (!onUploadProgress) {
    return;
  }
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
    const response = await restFetch("/api/assets/", {
      method: "POST",
      body: formData
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw data;
    }

    emitUploadProgress(onUploadProgress, total, total);
    return normalizeAssetUrls(data as Asset);
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

// Note: the tRPC `assets.list` procedure takes no cursor — it returns up to
// `page_size` (default 10000) assets in one page, so there is no client-side
// cursor pagination. Recursive listing goes through the separate
// `assets.recursive` procedure (see `load`).
type AssetQuery = {
  workflow_id?: string | null;
  parent_id?: string | null;
  content_type?: string | null;
  recursive?: boolean;
};

type AssetSearchQuery = {
  query: string;
  content_type?: string;
  page_size?: number;
  cursor?: string;
};

export type AssetUpdate = {
  id: string;
  name?: string;
  parent_id?: string;
  content_type?: string;
  metadata?: Record<string, unknown>;
  sketch_document_id?: string | null;
  timeline_id?: string | null;
  data?: string;
  data_encoding?: "base64";
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
    onUploadProgress?: (progressEvent: UploadProgressEvent) => void,
    source?: UploadSource
  ) => Promise<Asset>;
  load: (query: AssetQuery) => Promise<AssetList>;
  loadFolderTree: (sortBy?: string) => Promise<FolderTree>;
  loadCurrentFolder: (gridStore: AssetGridStoreApi) => Promise<AssetList>;
  search: (query: AssetSearchQuery) => Promise<AssetSearchResult>;
  update: (asset: AssetUpdate) => Promise<Asset>;
  delete: (id: string) => Promise<string[]>;
  download: (ids: string[]) => Promise<boolean>;
  getAssetsRecursive: (folderId: string) => Promise<AssetTreeNode[]>;
}

export type FolderTree = Record<string, AssetTreeNode>;

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
      const updatedA = a.updated_at ?? a.created_at;
      const updatedB = b.updated_at ?? b.created_at;
      return new Date(updatedB).getTime() - new Date(updatedA).getTime();
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

export interface AssetTreeNode extends Asset {
  updated_at?: string;
  children: AssetTreeNode[];
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
    const raw = await trpcClient.assets.get.query({
      id
    });
    const data = normalizeAssetUrls(raw);
    get().add(data);
    return data;
  },

  /**
   * Load assets from the server.
   *
   * Recursive queries are served by the dedicated `assets.recursive`
   * procedure (the `assets.list` procedure has no recursive flag) and
   * require a `parent_id` to recurse from.
   *
   * @param query The asset query to use to load assets.
   * @returns A promise that resolves to the loaded assets.
   */
  load: async (query: AssetQuery) => {
    if (query.recursive) {
      if (!query.parent_id) {
        throw new Error("Recursive asset queries require a parent_id");
      }
      const data = await trpcClient.assets.recursive.query({
        id: query.parent_id
      });
      const normalized = normalizeAssetList(data.assets ?? []);
      for (const asset of normalized) {
        get().add(asset);
      }
      return { next: null, assets: normalized };
    }
    const data = await trpcClient.assets.list.query({
      ...(query.parent_id !== undefined && query.parent_id !== null
        ? { parent_id: query.parent_id }
        : {}),
      ...(query.content_type ? { content_type: query.content_type } : {}),
      ...(query.workflow_id ? { workflow_id: query.workflow_id } : {})
    });
    const normalized = normalizeAssetList(data.assets);
    for (const asset of normalized) {
      get().add(asset);
    }
    return { ...data, assets: normalized };
  },

  /**
   * Load all folders as a tree
   */

  loadFolderTree: async (sortBy?: string) => {
    // Fallback implementation: fetch all folders via tRPC and build tree locally
    const data = await trpcClient.assets.list.query({
      content_type: "folder"
    });
    return buildFolderTree(
      normalizeAssetList(data.assets),
      sortBy === "updated_at" ? "updated_at" : "name"
    );
  },

  /**
   * Load the current folder and its parent folder.
   */
  loadCurrentFolder: async (gridStore: AssetGridStoreApi) => {
    const currentFolderId = gridStore.getState().currentFolderId;
    const setCurrentFolder = gridStore.getState().setCurrentFolder;
    const setParentFolder = gridStore.getState().setParentFolder;
    // Capture id at call time so a folder switch mid-flight doesn't write
    // stale header/breadcrumb data into the new folder's view.
    const requestedFolderId = currentFolderId;
    const isStillActive = () =>
      gridStore.getState().currentFolderId === requestedFolderId;

    if (requestedFolderId) {
      const asset = await get().get(requestedFolderId);
      if (!isStillActive()) {
        const empty: AssetList = { next: "", assets: [] };
        return empty;
      }
      setCurrentFolder(asset);
      if (asset?.parent_id) {
        get()
          .get(asset.parent_id)
          .then((parent) => {
            if (isStillActive()) {
              setParentFolder(parent);
            }
          });
      }
    }
    return get().load({ parent_id: requestedFolderId });
  },

  /**
   * Search assets globally with folder path information.
   *
   * @param query The search query parameters.
   * @returns A promise that resolves to the search results.
   */
  search: async (query: AssetSearchQuery): Promise<AssetSearchResult> => {
    try {
      const data = await trpcClient.assets.search.query({
        query: query.query,
        ...(query.content_type ? { content_type: query.content_type } : {}),
        ...(query.page_size ? { page_size: query.page_size } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {})
      });
      const result = data as unknown as AssetSearchResult;
      return { ...result, assets: normalizeAssetList(result.assets) };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Failed to search assets")
      ) {
        throw error;
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
    const tree = await get().getAssetsRecursive(folderId);

    const flatten = (nodes: AssetTreeNode[]): Asset[] => {
      let result: Asset[] = [];
      for (const node of nodes) {
        // Create a copy without children to return as a flat asset
         
        const { children, ...asset } = node;
        result.push(asset);
        if (node.children && node.children.length > 0) {
          result = result.concat(flatten(node.children));
        }
      }
      return result;
    };

    return flatten(tree);
  },
  /**
   * Delete an asset from the store and the server.
   *
   * @param id The ID of the asset to delete.
   * @returns A promise that resolves when the asset is deleted.
   */
  delete: async (id: string): Promise<string[]> => {
    // Capture parent before delete so we can invalidate the listing the
    // asset was visible in (its parent's children), not its own children.
    let parentId: string | null = null;
    try {
      const existing = await get().get(id);
      parentId = existing?.parent_id ?? null;
    } catch {
      // Ignore — best-effort lookup.
    }

    const { deleted_asset_ids } = await trpcClient.assets.delete.mutate({ id });

    deleted_asset_ids.forEach((assetId) => {
      get().invalidateQueries(["assets", assetId]);
      // The deleted asset's own children (if it was a folder).
      get().invalidateQueries(["assets", { parent_id: assetId }]);
    });
    // The folder listing that contained the deleted asset.
    if (parentId !== null) {
      get().invalidateQueries(["assets", { parent_id: parentId }]);
    }
    // Catch-all so workflow-scoped, search, and tree views refetch.
    get().invalidateQueries(["assets"]);
    return deleted_asset_ids;
  },

  /**
   * Download assets from the server.
   *
   * @param ids An array of asset IDs to download.
   * @returns A promise that resolves when the download is complete.
   */

  download: async (ids: string[]): Promise<boolean> => {
    console.info(`[AssetStore] Attempting to download assets: ${ids.join(", ")}`);
    try {
      const headers = await authHeader();

      const url = `${BASE_URL}/api/assets/download`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...(headers as Record<string, string>),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ asset_ids: ids })
      });

      if (!response.ok) {
        let errorDetail: unknown = null;
        try {
          const errorBuffer = await response.arrayBuffer();
          errorDetail = JSON.parse(new TextDecoder().decode(errorBuffer));
          console.error("[AssetStore] Decoded server error message:", errorDetail);
        } catch {
          // Could not parse error response
        }
        throw new Error(
          `Download failed with status ${response.status}`
        );
      }

      const data = await response.arrayBuffer();

      const disposition = response.headers.get("content-disposition");
      const filename = disposition
        ? disposition.split("filename=")[1]
        : "assets.zip";

      type ElectronSaveFile = (
        data: ArrayBuffer,
        filename: string,
        filters?: { name: string; extensions: string[] }[]
      ) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;

      interface ElectronWindow {
        electron?: { saveFile?: ElectronSaveFile };
        api?: { saveFile?: ElectronSaveFile };
      }

      const win = window as unknown as ElectronWindow;
      const electronApi = win.electron || win.api;

      if (electronApi?.saveFile) {
        const result = await electronApi.saveFile(data, filename, [
          { name: "ZIP Files", extensions: ["zip"] }
        ]);
        if (!result.success && !result.canceled) {
          throw new Error(result.error || "Failed to save file");
        }
      } else {
        // Browser fallback
        const contentType = response.headers.get("content-type") || "application/zip";
        const blob = new Blob([data], { type: contentType });
        const downloadUrl = window.URL.createObjectURL(blob);
        const anchorElement = document.createElement("a");
        anchorElement.href = downloadUrl;
        anchorElement.download = filename;
        document.body.appendChild(anchorElement);
        anchorElement.click();
        anchorElement.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }

      get().invalidateQueries(["assets"]);
      return true;
    } catch (error) {
      console.error(
        "[AssetStore] CATCH BLOCK: An error occurred during download.",
        error
      );
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
    // Use provided values or fall back to previous values for required fields.
    // This ensures we don't accidentally clear fields like parent_id when only
    // updating the name.
    const data = await trpcClient.assets.update.mutate({
      id: req.id,
      name: req.name !== undefined ? req.name : prev.name,
      parent_id:
        req.parent_id !== undefined
          ? req.parent_id
          : (prev.parent_id ?? undefined),
      content_type:
        req.content_type !== undefined
          ? req.content_type
          : prev.content_type,
      ...(req.metadata !== undefined ? { metadata: req.metadata } : {}),
      ...(req.sketch_document_id !== undefined
        ? { sketch_document_id: req.sketch_document_id }
        : {}),
      ...(req.timeline_id !== undefined
        ? { timeline_id: req.timeline_id }
        : {}),
      ...(req.data !== undefined ? { data: req.data } : {}),
      ...(req.data_encoding !== undefined
        ? { data_encoding: req.data_encoding }
        : {})
    });
    const normalized = normalizeAssetUrls(data);
    get().add(normalized);
    // Refresh the single-asset cache (keyed `["asset", id]` by useAssetById) so
    // consumers like prompt asset-mention chips reflect renames immediately.
    get().queryClient?.setQueryData(["asset", req.id], normalized);
    get().invalidateQueries(["assets", { parent_id: prev.parent_id }]);
    if (req.parent_id !== undefined && req.parent_id !== prev.parent_id) {
      get().invalidateQueries(["assets", { parent_id: req.parent_id }]);
    }
    return normalized;
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
    onUploadProgress?: (progressEvent: UploadProgressEvent) => void,
    source: UploadSource = "file"
  ) => {
    try {
      const preparedFile = await prepareUploadFile(file, source);
      console.debug("[AssetStore] upload-construction", {
        source,
        declaredMime: preparedFile.declaredMime || null,
        sniffedMime: preparedFile.sniffedMime,
        size: preparedFile.size,
        finalMime: preparedFile.finalMime
      });

      const asset = await uploadAsset(
        {
          workflow_id: workflow_id,
          parent_id: parent_id,
          content_type: preparedFile.finalMime,
          name: preparedFile.file.name
        },
        preparedFile.file,
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
    const data = await trpcClient.assets.recursive.query({ id: folderId });
    // The tRPC `recursive` procedure returns a flat array — convert it to the
    // tree shape expected by downstream code.
    return normalizeAssetList((data.assets ?? []) as unknown as AssetTreeNode[]);
  }
}));
