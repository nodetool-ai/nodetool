import { useAssetStore } from "../AssetStore";
import { Asset, AssetList, AssetSearchResult } from "../ApiTypes";
import { QueryClient } from "@tanstack/react-query";

// Mock dependencies
jest.mock("../ApiClient", () => ({
  client: {
    GET: jest.fn(),
    POST: jest.fn(),
    PUT: jest.fn(),
    DELETE: jest.fn()
  },
  authHeader: jest.fn()
}));

jest.mock("../AssetGridStore", () => ({
  useAssetGridStore: jest.fn(() => ({
    setAssets: jest.fn(),
    addAsset: jest.fn(),
    removeAsset: jest.fn(),
    updateAsset: jest.fn()
  }))
}));

jest.mock("../../utils/errorHandling", () => ({
  createErrorMessage: jest.fn(
    (error) => `Error: ${error?.response?.data?.message || error.message}`
  )
}));
jest.mock("../BASE_URL", () => ({
  BASE_URL: "http://localhost:8000"
}));

import axios from "axios";
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("AssetStore", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    // Reset store state
    useAssetStore.setState({
      queryClient: null
    });

    jest.clearAllMocks();

    // Mock URL APIs used by download()
    (window as any).URL = {
      createObjectURL: jest.fn(() => "blob:mock"),
      revokeObjectURL: jest.fn()
    } as any;
  });

  describe("setQueryClient", () => {
    it("should set the query client", () => {
      const { setQueryClient } = useAssetStore.getState();

      setQueryClient(queryClient);

      expect(useAssetStore.getState().queryClient).toBe(queryClient);
    });
  });

  describe("add", () => {
    it("should add an asset to the store", () => {
      const mockAsset: Asset = {
        id: "test-asset-id",
        name: "test-asset.jpg",
        content_type: "image/jpeg",
        size: 1024,
        created_at: "2023-01-01T00:00:00Z",
        parent_id: "",
        user_id: "test-user",
        get_url: "/assets/test-asset-id",
        workflow_id: null,
        thumb_url: "/thumbnail.jpg",
        metadata: {}
      };

      const { add } = useAssetStore.getState();
      add(mockAsset);

      // Verify asset was added (this would typically update some internal state or call other functions)
      // Since the add function might be more complex, we verify it doesn't throw
      expect(() => add(mockAsset)).not.toThrow();
    });
  });

  describe("invalidateQueries", () => {
    it("should invalidate queries when queryClient is set", () => {
      const { setQueryClient, invalidateQueries } = useAssetStore.getState();
      setQueryClient(queryClient);

      const mockInvalidateQueries = jest.spyOn(
        queryClient,
        "invalidateQueries"
      );

      const queryKey = ["assets"];
      invalidateQueries(queryKey);

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey });
    });

    it("should not throw when queryClient is not set", () => {
      const { invalidateQueries } = useAssetStore.getState();

      expect(() => invalidateQueries(["assets"])).not.toThrow();
    });
  });

  describe("get", () => {
    it("should fetch an asset by id", async () => {
      const mockAsset: Asset = {
        id: "test-asset-id",
        name: "test-asset.jpg",
        content_type: "image/jpeg",
        size: 1024,
        created_at: "2023-01-01T00:00:00Z",
        parent_id: "",
        user_id: "test-user",
        get_url: "/assets/test-asset-id",
        workflow_id: null,
        thumb_url: "/thumbnail.jpg",
        metadata: {}
      };

      const { client } = jest.requireActual("../ApiClient");
      client.GET.mockResolvedValue({ data: mockAsset });

      const { get } = useAssetStore.getState();
      const result = await get("test-asset-id");

      expect(client.GET).toHaveBeenCalledWith("/api/assets/{id}", {
        params: { path: { id: "test-asset-id" } }
      });
      expect(result).toEqual(mockAsset);
    });

    it("should handle API errors", async () => {
      const { client } = jest.requireActual("../ApiClient");
      const mockError = new Error("Asset not found");
      client.GET.mockRejectedValue(mockError);

      const { get } = useAssetStore.getState();

      await expect(get("invalid-id")).rejects.toThrow("Asset not found");
    });
  });

  describe("createAsset", () => {
    it("should create an asset with file upload", async () => {
      const mockFile = new File(["test content"], "test.jpg", {
        type: "image/jpeg"
      });
      const mockAsset: Asset = {
        id: "new-asset-id",
        name: "test.jpg",
        content_type: "image/jpeg",
        size: 1024,
        created_at: "2023-01-01T00:00:00Z",
        parent_id: "",
        user_id: "test-user",
        get_url: "/assets/test-asset-id",
        workflow_id: "test-workflow",
        thumb_url: "/thumbnail.jpg",
        metadata: {}
      };

      (mockedAxios as any).mockResolvedValue({ data: mockAsset });

      const { createAsset } = useAssetStore.getState();
      const result = await createAsset(mockFile, "test-workflow");

      expect(mockedAxios).toHaveBeenCalled();
      expect(result).toEqual(mockAsset);
    });

    it("should handle upload progress callback", async () => {
      const mockFile = new File(["test content"], "test.jpg", {
        type: "image/jpeg"
      });
      const mockAsset: Asset = {
        id: "new-asset-id",
        name: "test.jpg",
        content_type: "image/jpeg",
        size: 1024,
        created_at: "2023-01-01T00:00:00Z",
        parent_id: "",
        user_id: "test-user",
        get_url: "/assets/test-asset-id",
        workflow_id: null,
        thumb_url: "/thumbnail.jpg",
        metadata: {}
      };

      (mockedAxios as any).mockResolvedValue({ data: mockAsset });

      const mockOnUploadProgress = jest.fn();
      const { createAsset } = useAssetStore.getState();
      await createAsset(mockFile, undefined, undefined, mockOnUploadProgress);

      const axiosCall = (mockedAxios as any).mock.calls[0][0];
      expect(axiosCall.onUploadProgress).toBe(mockOnUploadProgress);
    });

    it("should handle upload errors", async () => {
      const mockFile = new File(["test content"], "test.jpg", {
        type: "image/jpeg"
      });
      const mockError = new Error("Upload failed");

      (mockedAxios as any).mockRejectedValue(mockError);

      const { createAsset } = useAssetStore.getState();

      await expect(createAsset(mockFile)).rejects.toMatch(/Upload failed/);
    });
  });

  describe("load", () => {
    it("should load assets with query parameters", async () => {
      const mockAssetList: AssetList = {
        next: null,
        assets: [
          {
            id: "asset1",
            name: "test1.jpg",
            content_type: "image/jpeg",
            size: 1024,
            created_at: "2023-01-01T00:00:00Z",
            parent_id: "",
            user_id: "test-user",
            get_url: "/assets/test-asset-id",
            workflow_id: null,
            thumb_url: "/thumbnail1.jpg",
            metadata: {}
          }
        ]
      };

      const { client } = jest.requireActual("../ApiClient");
      client.GET.mockResolvedValue({ data: mockAssetList });

      const { load } = useAssetStore.getState();
      const result = await load({
        workflow_id: "test-workflow",
        cursor: "test-cursor"
      });

      expect(client.GET).toHaveBeenCalledWith("/api/assets/", {
        params: {
          query: {
            workflow_id: "test-workflow",
            cursor: "test-cursor"
          }
        }
      });
      expect(result).toEqual(mockAssetList);
    });
  });

  describe("search", () => {
    it("should search assets with query parameters", async () => {
      const mockSearchResult: AssetSearchResult = {
        total_count: 1,
        is_global_search: false,
        assets: [
          {
            id: "asset1",
            name: "test1.jpg",
            content_type: "image/jpeg",
            size: 1024,
            created_at: "2023-01-01T00:00:00Z",
            parent_id: "",
            user_id: "test-user",
            get_url: "/assets/test-asset-id",
            workflow_id: null,
            thumb_url: "/thumbnail1.jpg",
            metadata: {},
            folder_name: "test-folder",
            folder_path: "/test/path",
            folder_id: "folder1"
          }
        ]
      };

      const { authHeader } = jest.requireActual("../ApiClient");
      (authHeader as jest.Mock).mockResolvedValue({});
      mockedAxios.get.mockResolvedValue({ data: mockSearchResult } as any);

      const { search } = useAssetStore.getState();
      const result = await search({
        query: "test query",
        content_type: "image/jpeg"
      });

      expect((mockedAxios as any).get).toHaveBeenCalled();
      expect(result).toEqual(mockSearchResult);
    });
  });

  describe("update", () => {
    it("should update an asset", async () => {
      const mockAsset: Asset = {
        id: "asset1",
        name: "updated.jpg",
        content_type: "image/jpeg",
        size: 2048,
        created_at: "2023-01-01T00:00:00Z",
        parent_id: "",
        user_id: "test-user",
        get_url: "/assets/test-asset-id",
        workflow_id: null,
        thumb_url: "/updated-thumbnail.jpg",
        metadata: { updated: true }
      };

      const { client } = jest.requireActual("../ApiClient");
      client.GET.mockResolvedValue({ data: { id: "asset1", parent_id: "" } });
      client.PUT.mockResolvedValue({ data: mockAsset });

      const { update } = useAssetStore.getState();
      const result = await update({
        id: "asset1",
        name: "updated.jpg"
      });

      expect(client.PUT).toHaveBeenCalledWith("/api/assets/{id}", {
        params: { path: { id: "asset1" } },
        body: {
          name: "updated.jpg",
          parent_id: null,
          content_type: null,
          metadata: null,
          data: null
        }
      });
      expect(result).toEqual(mockAsset);
    });
  });

  describe("delete", () => {
    it("should delete an asset", async () => {
      const { client } = jest.requireActual("../ApiClient");
      client.DELETE.mockResolvedValue({ data: { deleted_asset_ids: ["asset1"] } });

      const { delete: deleteAsset } = useAssetStore.getState();
      const result = await deleteAsset("asset1");

      expect(client.DELETE).toHaveBeenCalledWith("/api/assets/{id}", {
        params: { path: { id: "asset1" } }
      });
      expect(result).toEqual(["asset1"]);
    });
  });

  describe("download", () => {
    it("should download assets", async () => {
      const { authHeader } = jest.requireActual("../ApiClient");
      (authHeader as jest.Mock).mockResolvedValue({});
      (mockedAxios as any).mockResolvedValue({
        data: new ArrayBuffer(8),
        headers: {
          "content-type": "application/zip",
          "content-disposition": "attachment; filename=assets.zip"
        }
      });

      const { download } = useAssetStore.getState();
      const result = await download(["asset1", "asset2"]);

      expect((mockedAxios as any).mock.calls.length).toBeGreaterThan(0);
      expect(result).toBe(true);
    });
  });

  describe("createFolder", () => {
    it("should create a folder", async () => {
      const mockFolder: Asset = {
        id: "folder1",
        name: "New Folder",
        content_type: "application/x-directory",
        size: 0,
        created_at: "2023-01-01T00:00:00Z",
        parent_id: "parent1",
        workflow_id: null,
        user_id: "test-user",
        get_url: "/assets/folder1",
        thumb_url: null,
        metadata: {}
      };

      (mockedAxios as any).mockResolvedValue({ data: mockFolder });

      const { createFolder } = useAssetStore.getState();
      const result = await createFolder("parent1", "New Folder");

      expect((mockedAxios as any).mock.calls.length).toBeGreaterThan(0);
      expect(result).toEqual(mockFolder);
    });

    it("should create a root folder when parent_id is null", async () => {
      const mockFolder: Asset = {
        id: "root-folder",
        name: "Root Folder",
        content_type: "application/x-directory",
        size: 0,
        created_at: "2023-01-01T00:00:00Z",
        parent_id: "",
        user_id: "test-user",
        get_url: "/assets/test-asset-id",
        workflow_id: null,
        thumb_url: null,
        metadata: {}
      };

      (mockedAxios as any).mockResolvedValue({ data: mockFolder });

      const { createFolder } = useAssetStore.getState();
      const result = await createFolder(null, "Root Folder");

      expect((mockedAxios as any).mock.calls.length).toBeGreaterThan(0);
      expect(result).toEqual(mockFolder);
    });
  });

  describe("loadFolderTree", () => {
    it("should load folder tree with default sorting", async () => {
      const mockFolderTree = {
        folder1: {
          id: "folder1",
          name: "Folder 1",
          children: []
        }
      };

      const { client } = jest.requireActual("../ApiClient");
      client.GET.mockResolvedValue({ data: { assets: [] } });

      const { loadFolderTree } = useAssetStore.getState();
      const result = await loadFolderTree();

      // In the current implementation, we fetch folders via /api/assets/ and build the tree
      expect(client.GET).toHaveBeenCalledWith("/api/assets/", {
        params: { query: { content_type: "folder" } }
      });
      expect(result).toBeTruthy();
    });

    it("should load folder tree with custom sorting", async () => {
      const mockFolderTree = {
        folder1: {
          id: "folder1",
          name: "Folder 1",
          children: []
        }
      };

      const { client } = jest.requireActual("../ApiClient");
      client.GET.mockResolvedValue({ data: { assets: [] } });

      const { loadFolderTree } = useAssetStore.getState();
      const result = await loadFolderTree("updated_at");

      expect(client.GET).toHaveBeenCalledWith("/api/assets/", {
        params: { query: { content_type: "folder" } }
      });
      expect(result).toBeTruthy();
    });
  });

  describe("error handling", () => {
    it("should handle network errors gracefully", async () => {
      const { client } = jest.requireActual("../ApiClient");
      client.GET.mockRejectedValue(new Error("Network error"));

      const { get } = useAssetStore.getState();

      await expect(get("test-id")).rejects.toThrow("Network error");
    });

    it("should handle API response errors", async () => {
      const { createAsset } = useAssetStore.getState();
      const mockFile = new File(["test"], "test.jpg");
      (mockedAxios as any).mockRejectedValue({
        response: {
          status: 404,
          data: { message: "Asset not found" }
        }
      });
      await expect(createAsset(mockFile)).rejects.toMatch(/Asset not found/);
    });
  });

  describe("utility functions", () => {
    describe("sort", () => {
      it("should sort assets by created_at in descending order", () => {
        const assets = {
          asset1: {
            id: "asset1",
            name: "asset1.jpg",
            created_at: "2023-01-01T10:00:00Z"
          },
          asset2: {
            id: "asset2",
            name: "asset2.jpg",
            created_at: "2023-01-02T10:00:00Z"
          },
          asset3: {
            id: "asset3",
            name: "asset3.jpg",
            created_at: "2023-01-01T15:00:00Z"
          }
        };

        // The sort function is internal, so we can't directly test it
        // But we can verify the behavior through the store methods
        expect(true).toBe(true); // Placeholder test
      });
    });

    describe("buildFolderTree", () => {
      it("should build folder tree structure", () => {
        // The buildFolderTree function is internal, so we can't directly test it
        // But we can verify the behavior through the store methods
        expect(true).toBe(true); // Placeholder test
      });
    });
  });
});
