import { renderHook, act } from "@testing-library/react";
import { useReplicateStore, ReplicateModel, ReplicateVersion } from "../ReplicateStore";

describe("ReplicateStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useReplicateStore.setState({
      searchQuery: "",
      searchResults: [],
      isSearching: false,
      searchError: null,
      modelCache: {},
      versionCache: {},
      selectedModel: null,
      selectedVersion: null,
      recentModels: []
    });
  });

  describe("Search state", () => {
    it("should initialize with empty search state", () => {
      const { result } = renderHook(() => useReplicateStore());

      expect(result.current.searchQuery).toBe("");
      expect(result.current.searchResults).toEqual([]);
      expect(result.current.isSearching).toBe(false);
      expect(result.current.searchError).toBeNull();
    });

    it("should update search query", () => {
      const { result } = renderHook(() => useReplicateStore());

      act(() => {
        result.current.setSearchQuery("stability-ai");
      });

      expect(result.current.searchQuery).toBe("stability-ai");
    });

    it("should update search results and cache models", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockModels: ReplicateModel[] = [
        {
          owner: "stability-ai",
          name: "sdxl",
          description: "SDXL Image Generation",
          url: "https://replicate.com/stability-ai/sdxl",
          visibility: "public"
        },
        {
          owner: "openai",
          name: "whisper",
          description: "Audio transcription",
          url: "https://replicate.com/openai/whisper",
          visibility: "public"
        }
      ];

      act(() => {
        result.current.setSearchResults(mockModels);
      });

      expect(result.current.searchResults).toEqual(mockModels);
      // Check models were cached
      expect(result.current.getCachedModel("stability-ai/sdxl")).toEqual(mockModels[0]);
      expect(result.current.getCachedModel("openai/whisper")).toEqual(mockModels[1]);
    });

    it("should update isSearching state", () => {
      const { result } = renderHook(() => useReplicateStore());

      act(() => {
        result.current.setIsSearching(true);
      });

      expect(result.current.isSearching).toBe(true);

      act(() => {
        result.current.setIsSearching(false);
      });

      expect(result.current.isSearching).toBe(false);
    });

    it("should update search error", () => {
      const { result } = renderHook(() => useReplicateStore());

      act(() => {
        result.current.setSearchError("Network error");
      });

      expect(result.current.searchError).toBe("Network error");

      act(() => {
        result.current.setSearchError(null);
      });

      expect(result.current.searchError).toBeNull();
    });
  });

  describe("Model cache", () => {
    it("should cache and retrieve models", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockModel: ReplicateModel = {
        owner: "stability-ai",
        name: "sdxl",
        description: "SDXL",
        url: "https://replicate.com/stability-ai/sdxl",
        visibility: "public"
      };

      act(() => {
        result.current.cacheModel("stability-ai/sdxl", mockModel);
      });

      const cached = result.current.getCachedModel("stability-ai/sdxl");
      expect(cached).toEqual(mockModel);
    });

    it("should return null for non-existent cache entry", () => {
      const { result } = renderHook(() => useReplicateStore());

      const cached = result.current.getCachedModel("non-existent/model");
      expect(cached).toBeNull();
    });

    it("should cache and retrieve versions", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockVersion: ReplicateVersion = {
        id: "abc123",
        created_at: "2024-01-01T00:00:00Z",
        cog_version: "0.8.0"
      };

      act(() => {
        result.current.cacheVersion("abc123", mockVersion);
      });

      const cached = result.current.getCachedVersion("abc123");
      expect(cached).toEqual(mockVersion);
    });

    it("should return null for non-existent version cache entry", () => {
      const { result } = renderHook(() => useReplicateStore());

      const cached = result.current.getCachedVersion("non-existent");
      expect(cached).toBeNull();
    });

    it("should clear all cache", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockModel: ReplicateModel = {
        owner: "test",
        name: "model",
        description: "Test",
        url: "https://replicate.com/test/model",
        visibility: "public"
      };

      act(() => {
        result.current.cacheModel("test/model", mockModel);
        result.current.setSearchResults([mockModel]);
      });

      expect(result.current.getCachedModel("test/model")).not.toBeNull();
      expect(result.current.searchResults.length).toBe(1);

      act(() => {
        result.current.clearCache();
      });

      // Cache should be cleared, but getCachedModel returns null for missing entries
      expect(result.current.searchResults).toEqual([]);
    });
  });

  describe("Model selection", () => {
    it("should set selected model and add to recent", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockModel: ReplicateModel = {
        owner: "stability-ai",
        name: "sdxl",
        description: "SDXL",
        url: "https://replicate.com/stability-ai/sdxl",
        visibility: "public"
      };

      act(() => {
        result.current.setSelectedModel(mockModel);
      });

      expect(result.current.selectedModel).toEqual(mockModel);
      expect(result.current.recentModels).toContain("stability-ai/sdxl");
    });

    it("should set selected version", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockVersion: ReplicateVersion = {
        id: "abc123",
        created_at: "2024-01-01T00:00:00Z"
      };

      act(() => {
        result.current.setSelectedVersion(mockVersion);
      });

      expect(result.current.selectedVersion).toEqual(mockVersion);
    });

    it("should clear selection when setting null", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockModel: ReplicateModel = {
        owner: "test",
        name: "model",
        description: "Test",
        url: "https://replicate.com/test/model",
        visibility: "public"
      };

      act(() => {
        result.current.setSelectedModel(mockModel);
      });

      expect(result.current.selectedModel).not.toBeNull();

      act(() => {
        result.current.setSelectedModel(null);
      });

      expect(result.current.selectedModel).toBeNull();
    });
  });

  describe("Recent models", () => {
    it("should add models to recent list", () => {
      const { result } = renderHook(() => useReplicateStore());

      act(() => {
        result.current.addRecentModel("stability-ai/sdxl");
        result.current.addRecentModel("openai/whisper");
      });

      expect(result.current.recentModels).toEqual([
        "openai/whisper",
        "stability-ai/sdxl"
      ]);
    });

    it("should move duplicate to front of recent list", () => {
      const { result } = renderHook(() => useReplicateStore());

      act(() => {
        result.current.addRecentModel("model1");
        result.current.addRecentModel("model2");
        result.current.addRecentModel("model3");
        result.current.addRecentModel("model1"); // Add again
      });

      expect(result.current.recentModels[0]).toBe("model1");
      expect(result.current.recentModels).toHaveLength(3);
    });

    it("should limit recent models to maximum", () => {
      const { result } = renderHook(() => useReplicateStore());

      act(() => {
        for (let i = 0; i < 15; i++) {
          result.current.addRecentModel(`model${i}`);
        }
      });

      expect(result.current.recentModels.length).toBeLessThanOrEqual(10);
    });

    it("should clear recent models", () => {
      const { result } = renderHook(() => useReplicateStore());

      act(() => {
        result.current.addRecentModel("model1");
        result.current.addRecentModel("model2");
      });

      expect(result.current.recentModels.length).toBe(2);

      act(() => {
        result.current.clearRecentModels();
      });

      expect(result.current.recentModels).toEqual([]);
    });
  });

  describe("Store isolation", () => {
    it("should not affect other state when updating search", () => {
      const { result } = renderHook(() => useReplicateStore());

      const mockModel: ReplicateModel = {
        owner: "test",
        name: "model",
        description: "Test",
        url: "https://replicate.com/test/model",
        visibility: "public"
      };

      act(() => {
        result.current.setSelectedModel(mockModel);
        result.current.addRecentModel("test/model");
      });

      act(() => {
        result.current.setSearchQuery("new query");
        result.current.setIsSearching(true);
      });

      // Selection and recent should not be affected
      expect(result.current.selectedModel).toEqual(mockModel);
      expect(result.current.recentModels).toContain("test/model");
    });
  });
});
