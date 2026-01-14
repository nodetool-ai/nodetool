import { renderHook, act } from "@testing-library/react";
import { useRecentSearchesStore } from "../RecentSearchesStore";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));

describe("useRecentSearchesStore", () => {
  beforeEach(() => {
    act(() => {
      useRecentSearchesStore.getState().clearSearches();
    });
  });

  describe("initial state", () => {
    it("should initialize with empty recent searches", () => {
      const { result } = renderHook(() => useRecentSearchesStore());
      expect(result.current.recentSearches).toEqual([]);
    });
  });

  describe("addSearch", () => {
    it("should add a new search term", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("text", 3);
      });

      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0].term).toBe("text");
      expect(result.current.recentSearches[0].resultCount).toBe(3);
    });

    it("should not add empty search terms", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("   ", 0);
      });

      expect(result.current.recentSearches).toHaveLength(0);
    });

    it("should move existing search to top when added again", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("text", 3);
        result.current.addSearch("image", 2);
        result.current.addSearch("text", 5);
      });

      expect(result.current.recentSearches).toHaveLength(2);
      expect(result.current.recentSearches[0].term).toBe("text");
      expect(result.current.recentSearches[0].resultCount).toBe(5);
      expect(result.current.recentSearches[1].term).toBe("image");
    });

    it("should limit to maximum number of searches", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        for (let i = 0; i < 15; i++) {
          result.current.addSearch(`search${i}`, i);
        }
      });

      expect(result.current.recentSearches).toHaveLength(10);
      expect(result.current.recentSearches[0].term).toBe("search14");
      expect(result.current.recentSearches[9].term).toBe("search5");
    });

    it("should normalize search terms to lowercase", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("TEXT", 3);
      });

      expect(result.current.recentSearches[0].term).toBe("text");
    });
  });

  describe("removeSearch", () => {
    it("should remove a specific search term", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("text", 3);
        result.current.addSearch("image", 2);
        result.current.removeSearch("text");
      });

      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0].term).toBe("image");
    });

    it("should handle removing non-existent search", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("text", 3);
        result.current.removeSearch("nonexistent");
      });

      expect(result.current.recentSearches).toHaveLength(1);
    });
  });

  describe("clearSearches", () => {
    it("should remove all recent searches", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("text", 3);
        result.current.addSearch("image", 2);
        result.current.clearSearches();
      });

      expect(result.current.recentSearches).toHaveLength(0);
    });
  });

  describe("getSearches", () => {
    it("should return all recent searches", () => {
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("text", 3);
        result.current.addSearch("image", 2);
      });

      const searches = result.current.getSearches();
      expect(searches).toHaveLength(2);
    });
  });

  describe("timestamp", () => {
    it("should set timestamp when adding search", () => {
      const beforeTime = Date.now();
      const { result } = renderHook(() => useRecentSearchesStore());

      act(() => {
        result.current.addSearch("text", 3);
      });

      const afterTime = Date.now();
      expect(result.current.recentSearches[0].timestamp).toBeGreaterThanOrEqual(
        beforeTime
      );
      expect(result.current.recentSearches[0].timestamp).toBeLessThanOrEqual(
        afterTime
      );
    });
  });
});
