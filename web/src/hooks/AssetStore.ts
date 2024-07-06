import { create } from "zustand";
import { client, BASE_URL, authHeader } from "../stores/ApiClient";
import { Asset, AssetList } from "../stores/ApiTypes";
import { devLog } from "../utils/DevLog";
import { QueryClient, QueryKey } from "react-query";
import axios from "axios";

const createAsset = (
  url: string,
  method: string,
  headers: any,
  jsonData: any,
  file: File | undefined,
  onUploadProgress: (progressEvent: any) => void
): Promise<Asset> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("json", JSON.stringify(jsonData));

    if (file) {
      formData.append("file", file);
    }

    axios({
      url: url,
      method: method,
      data: formData,
      headers: {
        ...headers,
        "Content-Type": "multipart/form-data"
      },
      onUploadProgress
    })
      .then((res) => resolve(res.data as Asset))
      .catch((err) => reject(err));
  });
};

export type AssetQuery = {
  cursor?: string;
  workflow_id?: string | null;
  parent_id?: string | null;
  content_type?: string | null;
};

export type AssetUpdate = {
  id: string;
  status?: string;
  name?: string;
  parent_id?: string;
  content_type?: string;
  duration?: number;
};

export interface AssetStore {
  queryClient: QueryClient | null;
  setQueryClient: (queryClient: QueryClient) => void;
  add: (asset: Asset) => void;
  invalidateQueries: (queryKey: QueryKey) => void;
  currentFolderId: string | null;
  setCurrentFolderId: (folderId: string | null) => void;
  currentFolder: Asset | null;
  parentFolder: Asset | null;
  get: (id: string) => Promise<Asset>;
  createFolder: (parent_id: string | null, name: string) => Promise<Asset>;
  createAsset: (
    file: File,
    workflow_id?: string,
    parent_id?: string,
    onUploadProgress?: (progressEvent: any) => void
  ) => Promise<Asset>;
  load: (query: AssetQuery) => Promise<AssetList>;
  loadFolderTree: (sortBy?: string) => Promise<Record<string, any>>;
  loadCurrentFolder: (cursor?: string) => Promise<AssetList>;
  loadFolderById: (id: string) => Promise<AssetList>;
  update: (asset: AssetUpdate) => Promise<Asset>;
  delete: (id: string) => Promise<void>;
  download: (ids: string[]) => void;
}

/**
 * Sort assets by created_at in descending order.
 */
const sort = (assets: { [key: string]: Asset }) => {
  return Object.values(assets).sort((a, b) => {
    return -a.created_at.localeCompare(b.created_at);
  });
};

const buildFolderTree = (
  folders: Asset[],
  sortBy: "name" | "updated_at" = "name"
) => {
  const tree: Record<string, any> = {};
  const lookup: Record<string, any> = {};

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

  const sortNodes = (a: any, b: any) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    } else if (sortBy === "updated_at") {
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    return 0;
  };

  const sortChildren = (node: any) => {
    node.children.sort(sortNodes);
    node.children.forEach(sortChildren);
  };

  // Convert tree object to array, sort, and convert back to object
  const sortedTreeArray = Object.values(tree).sort(sortNodes);
  const sortedTree: Record<string, any> = {};
  sortedTreeArray.forEach((node) => {
    sortedTree[node.id] = node;
  });

  Object.values(sortedTree).forEach(sortChildren);

  return sortedTree;
};

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
    get().queryClient?.invalidateQueries(queryKey);
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
      throw error;
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
  load: async (query: AssetQuery) => {
    const { data, error } = await client.GET("/api/assets/", {
      params: {
        query: query,
      }
    });
    if (error) {
      throw error;
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
    const { assets } = await get().load({ content_type: "folder" });
    return buildFolderTree(assets, (sortBy as "name" | "updated_at") || "name");
  },

  /**
   * Load the current folder and its parent folder.
   */
  loadCurrentFolder: async (cursor?: string) => {
    const currentFolderId = get().currentFolderId;
    if (currentFolderId) {
      const asset = await get().get(currentFolderId);
      set({ currentFolder: asset });
      if (asset?.parent_id !== "") {
        get()
          .get(asset.parent_id)
          .then((parent) => {
            set({ parentFolder: parent });
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
   * Create a folder on the server.
   * Folders are assets with content_type "folder".
   * The root folder has parent_id = "0" and the
   * same ID as the owning user.
   *
   * @param parent_id The ID of the parent asset.
   * @param name The name of the folder.
   */
  createFolder: async (parent_id: string | null, name: string) => {
    const folder = await createAsset(
      BASE_URL + "/api/assets/",
      "POST",
      authHeader(),
      {
        parent_id: parent_id,
        content_type: "folder",
        name: name
      },
      undefined,
      (_) => {}
    );
    get().add(folder);
    get().invalidateQueries(["assets", { parent_id: parent_id }]);
    return folder;
  },

  /**
   * Set the current folder.
   *
   * @param folderId The ID of the folder.
   */
  setCurrentFolderId: (folderId: string | null) => {
    set({ currentFolderId: folderId, currentFolder: null, parentFolder: null });
  },

  /**
   * Delete an asset from the store and the server.
   *
   * @param id The ID of the asset to delete.
   * @returns A promise that resolves when the asset is deleted.
   */
  delete: async (id: string) => {
    const asset = await get().get(id);
    const { error } = await client.DELETE("/api/assets/{id}", {
      params: { path: { id } }
    });

    if (error) {
      throw error;
    }

    get().invalidateQueries(["assets", id]);
    get().invalidateQueries(["assets", { parent_id: asset.parent_id }]);
  },

  /**
   * Download assets from the server.
   *
   * @param ids An array of asset IDs to download.
   * @returns A promise that resolves when the download is complete.
   */

  download: async (ids: string[]) => {
    try {
      console.log("Starting download process");
      console.log("IDs to download:", ids);


      const url = `${BASE_URL}/api/assets/download`;
      console.log("Request URL:", url);

      const response = await axios({
        url: url,
        method: "POST",
        data: {
          asset_ids: ids
        },
        responseType: "blob"
      });

      console.log("Response received");
      console.log("Response status:", response.status);

      const blob = new Blob([response.data], {
        type: response.headers["content-type"]
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = response.headers["content-disposition"]
        ? response.headers["content-disposition"].split("filename=")[1]
        : "assets.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      console.log("Download initiated");

      get().invalidateQueries(["assets"]);
      console.log("Queries invalidated");

      return true;
    } catch (error) {
      console.error("Error in download function:", error);
      if (axios.isAxiosError(error)) {
        console.error("Error message:", error.message);
        console.error("Error response:", error.response?.data);
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
        status: req.status || prev.status,
        name: req.name || prev.name,
        parent_id: req.parent_id || prev.parent_id,
        content_type: req.content_type || prev.content_type
      }
    });
    if (error) {
      throw error;
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
    onUploadProgress?: (progressEvent: any) => void
  ) => {
    const asset = await createAsset(
      BASE_URL + "/api/assets/",
      "POST",
      authHeader(),
      {
        workflow_id: workflow_id,
        parent_id: parent_id,
        content_type: file.type,
        name: file.name
      },
      file,
      onUploadProgress || ((_) => {})
    );
    get().invalidateQueries(["assets", { parent_id: asset.parent_id }]);
    get().add(asset);

    return asset;
  }
}));
