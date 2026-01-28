import { renderHook, act } from "@testing-library/react";
import { useWorkflowAssetStore } from "../WorkflowAssetStore";
import * as ApiClient from "../ApiClient";
import { Asset } from "../ApiTypes";

// Mock the API client
jest.mock("../ApiClient");

const mockClient = ApiClient.client as any;

// Mock loglevel
jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe("WorkflowAssetStore", () => {
  const mockAssets: Asset[] = [
    {
      id: "asset1",
      user_id: "user1",
      workflow_id: "workflow1",
      parent_id: "",
      name: "image.png",
      content_type: "image/png",
      created_at: "2024-01-01T00:00:00Z",
      get_url: null,
      thumb_url: null
    },
    {
      id: "asset2",
      user_id: "user1",
      workflow_id: "workflow1",
      parent_id: "",
      name: "video.mp4",
      content_type: "video/mp4",
      created_at: "2024-01-02T00:00:00Z",
      get_url: null,
      thumb_url: null
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    useWorkflowAssetStore.setState({
      assetsByWorkflow: {},
      loadingByWorkflow: {},
      errorsByWorkflow: {}
    });
  });

  describe("Initial State", () => {
    it("initializes with empty state", () => {
      const { result } = renderHook(() => useWorkflowAssetStore());

      expect(result.current.assetsByWorkflow).toEqual({});
      expect(result.current.loadingByWorkflow).toEqual({});
      expect(result.current.errorsByWorkflow).toEqual({});
    });
  });

  describe("loadWorkflowAssets", () => {
    it("loads workflow assets successfully", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: { assets: mockAssets },
        error: null
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      let loadedAssets: Asset[] = [];
      await act(async () => {
        loadedAssets = await result.current.loadWorkflowAssets("workflow1");
      });

      expect(loadedAssets).toEqual(mockAssets);
      expect(result.current.assetsByWorkflow["workflow1"]).toEqual(mockAssets);
      expect(result.current.loadingByWorkflow["workflow1"]).toBe(false);
      expect(result.current.errorsByWorkflow["workflow1"]).toBeNull();
      expect(mockClient.GET).toHaveBeenCalledWith("/api/assets/", {
        params: {
          query: {
            workflow_id: "workflow1"
          }
        }
      });
    });

    it("handles empty assets response", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: { assets: [] },
        error: null
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      let loadedAssets: Asset[] = [];
      await act(async () => {
        loadedAssets = await result.current.loadWorkflowAssets("workflow1");
      });

      expect(loadedAssets).toEqual([]);
      expect(result.current.assetsByWorkflow["workflow1"]).toEqual([]);
    });

    it("handles missing assets in response", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: {},
        error: null
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      let loadedAssets: Asset[] = [];
      await act(async () => {
        loadedAssets = await result.current.loadWorkflowAssets("workflow1");
      });

      expect(loadedAssets).toEqual([]);
      expect(result.current.assetsByWorkflow["workflow1"]).toEqual([]);
    });

    it("sets loading state during fetch", async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockClient.GET.mockReturnValueOnce(promise);

      const { result } = renderHook(() => useWorkflowAssetStore());

      // Start loading
      act(() => {
        result.current.loadWorkflowAssets("workflow1");
      });

      // Should be loading
      expect(result.current.loadingByWorkflow["workflow1"]).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise({ data: { assets: mockAssets }, error: null });
        await promise;
      });

      // Should no longer be loading
      expect(result.current.loadingByWorkflow["workflow1"]).toBe(false);
    });

    it("handles API error", async () => {
      const errorResponse = { detail: "Failed to fetch assets" };
      mockClient.GET.mockResolvedValueOnce({
        data: null,
        error: errorResponse
      });

      let errorCaught = null;
      try {
        await useWorkflowAssetStore.getState().loadWorkflowAssets("workflow1");
      } catch (error) {
        errorCaught = error;
      }

      expect(errorCaught).toBeTruthy();
      expect(useWorkflowAssetStore.getState().errorsByWorkflow["workflow1"]).toBeTruthy();
    });

    it("handles network error", async () => {
      const error = new Error("Network error");
      mockClient.GET.mockRejectedValue(error);

      let errorCaught = null;
      try {
        await useWorkflowAssetStore.getState().loadWorkflowAssets("workflow1");
      } catch (e) {
        errorCaught = e;
      }

      const state = useWorkflowAssetStore.getState();
      
      expect(errorCaught).toBeTruthy();
      expect(state.errorsByWorkflow["workflow1"]).toBeInstanceOf(Error);
      expect(state.errorsByWorkflow["workflow1"]?.message).toBe("Network error");
    });

    it("clears error state before new fetch", async () => {
      // Set initial error
      useWorkflowAssetStore.setState({
        errorsByWorkflow: {
          workflow1: new Error("Previous error")
        }
      });

      mockClient.GET.mockResolvedValueOnce({
        data: { assets: mockAssets },
        error: null
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      await act(async () => {
        await result.current.loadWorkflowAssets("workflow1");
      });

      expect(result.current.errorsByWorkflow["workflow1"]).toBeNull();
    });

    it("can load assets for multiple workflows", async () => {
      const workflow2Assets: Asset[] = [
        {
          id: "asset3",
          user_id: "user1",
          workflow_id: "workflow2",
          parent_id: "",
          name: "document.pdf",
          content_type: "application/pdf",
          created_at: "2024-01-03T00:00:00Z",
          get_url: null,
          thumb_url: null
        }
      ];

      mockClient.GET
        .mockResolvedValueOnce({
          data: { assets: mockAssets },
          error: null
        })
        .mockResolvedValueOnce({
          data: { assets: workflow2Assets },
          error: null
        });

      const { result } = renderHook(() => useWorkflowAssetStore());

      await act(async () => {
        await result.current.loadWorkflowAssets("workflow1");
        await result.current.loadWorkflowAssets("workflow2");
      });

      expect(result.current.assetsByWorkflow["workflow1"]).toEqual(mockAssets);
      expect(result.current.assetsByWorkflow["workflow2"]).toEqual(workflow2Assets);
    });
  });

  describe("getWorkflowAssets", () => {
    it("returns assets for a workflow", () => {
      useWorkflowAssetStore.setState({
        assetsByWorkflow: {
          workflow1: mockAssets
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      const assets = result.current.getWorkflowAssets("workflow1");
      expect(assets).toEqual(mockAssets);
    });

    it("returns empty array for unknown workflow", () => {
      const { result } = renderHook(() => useWorkflowAssetStore());

      const assets = result.current.getWorkflowAssets("unknown");
      expect(assets).toEqual([]);
    });

    it("returns cached assets without API call", () => {
      useWorkflowAssetStore.setState({
        assetsByWorkflow: {
          workflow1: mockAssets
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      result.current.getWorkflowAssets("workflow1");
      result.current.getWorkflowAssets("workflow1");

      expect(mockClient.GET).not.toHaveBeenCalled();
    });
  });

  describe("clearWorkflowAssets", () => {
    it("clears assets for a specific workflow", () => {
      useWorkflowAssetStore.setState({
        assetsByWorkflow: {
          workflow1: mockAssets,
          workflow2: []
        },
        loadingByWorkflow: {
          workflow1: false,
          workflow2: false
        },
        errorsByWorkflow: {
          workflow1: null,
          workflow2: null
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      act(() => {
        result.current.clearWorkflowAssets("workflow1");
      });

      expect(result.current.assetsByWorkflow["workflow1"]).toBeUndefined();
      expect(result.current.loadingByWorkflow["workflow1"]).toBeUndefined();
      expect(result.current.errorsByWorkflow["workflow1"]).toBeUndefined();
      // workflow2 should still exist
      expect(result.current.assetsByWorkflow["workflow2"]).toEqual([]);
    });

    it("handles clearing non-existent workflow", () => {
      const { result } = renderHook(() => useWorkflowAssetStore());

      act(() => {
        result.current.clearWorkflowAssets("unknown");
      });

      // Should not throw error
      expect(result.current.assetsByWorkflow).toEqual({});
    });
  });

  describe("clearAllWorkflowAssets", () => {
    it("clears all workflow assets", () => {
      useWorkflowAssetStore.setState({
        assetsByWorkflow: {
          workflow1: mockAssets,
          workflow2: []
        },
        loadingByWorkflow: {
          workflow1: false,
          workflow2: true
        },
        errorsByWorkflow: {
          workflow1: null,
          workflow2: new Error("Test error")
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      act(() => {
        result.current.clearAllWorkflowAssets();
      });

      expect(result.current.assetsByWorkflow).toEqual({});
      expect(result.current.loadingByWorkflow).toEqual({});
      expect(result.current.errorsByWorkflow).toEqual({});
    });
  });

  describe("isWorkflowLoading", () => {
    it("returns true when workflow is loading", () => {
      useWorkflowAssetStore.setState({
        loadingByWorkflow: {
          workflow1: true
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      expect(result.current.isWorkflowLoading("workflow1")).toBe(true);
    });

    it("returns false when workflow is not loading", () => {
      useWorkflowAssetStore.setState({
        loadingByWorkflow: {
          workflow1: false
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      expect(result.current.isWorkflowLoading("workflow1")).toBe(false);
    });

    it("returns false for unknown workflow", () => {
      const { result } = renderHook(() => useWorkflowAssetStore());

      expect(result.current.isWorkflowLoading("unknown")).toBe(false);
    });
  });

  describe("getWorkflowError", () => {
    it("returns error for a workflow", () => {
      const testError = new Error("Test error");
      useWorkflowAssetStore.setState({
        errorsByWorkflow: {
          workflow1: testError
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      expect(result.current.getWorkflowError("workflow1")).toBe(testError);
    });

    it("returns null when no error", () => {
      useWorkflowAssetStore.setState({
        errorsByWorkflow: {
          workflow1: null
        }
      });

      const { result } = renderHook(() => useWorkflowAssetStore());

      expect(result.current.getWorkflowError("workflow1")).toBeNull();
    });

    it("returns null for unknown workflow", () => {
      const { result } = renderHook(() => useWorkflowAssetStore());

      expect(result.current.getWorkflowError("unknown")).toBeNull();
    });
  });
});
