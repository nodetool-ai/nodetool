import { act, renderHook } from "@testing-library/react";
import useSearchHistoryStore, {
  MAX_HISTORY_SIZE,
  DEFAULT_RECENT_LIMIT
} from "../SearchHistoryStore";

describe("SearchHistoryStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    const { clearHistory } = useSearchHistoryStore.getState();
    clearHistory();
  });

  describe("initial state", () => {
    it("should initialize with empty entries", () => {
      const { result } = renderHook(() => useSearchHistoryStore());
      expect(result.current.entries).toEqual([]);
    });

    it("should have empty recent searches initially", () => {
      const { result } = renderHook(() => useSearchHistoryStore());
      const recent = result.current.getRecentSearches();
      expect(recent).toEqual([]);
    });
  });

  describe("addSearchTerm", () => {
    it("should add a search term to history", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("image generator");
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].term).toBe("image generator");
      expect(result.current.entries[0].timestamp).toBeLessThanOrEqual(Date.now());
    });

    it("should add new term at the beginning of history", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("first search");
        result.current.addSearchTerm("second search");
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[0].term).toBe("second search");
      expect(result.current.entries[1].term).toBe("first search");
    });

    it("should remove duplicate term and add it at the beginning", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("duplicate");
        result.current.addSearchTerm("another term");
        result.current.addSearchTerm("duplicate");
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[0].term).toBe("duplicate");
      expect(result.current.entries[1].term).toBe("another term");
    });

    it("should not add empty or whitespace-only terms", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("");
        result.current.addSearchTerm("   ");
        result.current.addSearchTerm("\t");
      });

      expect(result.current.entries).toHaveLength(0);
    });

    it("should trim whitespace from terms", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("  search term  ");
      });

      expect(result.current.entries[0].term).toBe("search term");
    });

    it("should limit history size to MAX_HISTORY_SIZE", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        // Add more than max size
        for (let i = 0; i < MAX_HISTORY_SIZE + 10; i++) {
          result.current.addSearchTerm(`search ${i}`);
        }
      });

      expect(result.current.entries).toHaveLength(MAX_HISTORY_SIZE);
      // Most recent should be last added
      expect(result.current.entries[0].term).toBe(`search ${MAX_HISTORY_SIZE + 9}`);
    });
  });

  describe("removeSearchTerm", () => {
    it("should remove a specific search term from history", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("first");
        result.current.addSearchTerm("second");
        result.current.addSearchTerm("third");
      });

      act(() => {
        result.current.removeSearchTerm("second");
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries.map((e) => e.term)).not.toContain("second");
      expect(result.current.entries.map((e) => e.term)).toEqual([
        "third",
        "first"
      ]);
    });

    it("should not affect other terms when removing one", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("keep1");
        result.current.addSearchTerm("remove me");
        result.current.addSearchTerm("keep2");
      });

      act(() => {
        result.current.removeSearchTerm("remove me");
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[0].term).toBe("keep2");
      expect(result.current.entries[1].term).toBe("keep1");
    });

    it("should handle removing non-existent term gracefully", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("existing");
      });

      expect(() => {
        act(() => {
          result.current.removeSearchTerm("non-existent");
        });
      }).not.toThrow();

      expect(result.current.entries).toHaveLength(1);
    });
  });

  describe("clearHistory", () => {
    it("should clear all search history", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        result.current.addSearchTerm("first");
        result.current.addSearchTerm("second");
        result.current.addSearchTerm("third");
      });

      expect(result.current.entries).toHaveLength(3);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.entries).toHaveLength(0);
    });
  });

  describe("getRecentSearches", () => {
    it("should return all entries when limit is not specified", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.addSearchTerm(`search ${i}`);
        }
      });

      const recent = result.current.getRecentSearches();
      expect(recent).toHaveLength(5);
    });

    it("should respect custom limit", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.addSearchTerm(`search ${i}`);
        }
      });

      const recent = result.current.getRecentSearches(3);
      expect(recent).toHaveLength(3);
    });

    it("should default to DEFAULT_RECENT_LIMIT", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      act(() => {
        for (let i = 0; i < DEFAULT_RECENT_LIMIT + 5; i++) {
          result.current.addSearchTerm(`search ${i}`);
        }
      });

      const recent = result.current.getRecentSearches();
      expect(recent).toHaveLength(DEFAULT_RECENT_LIMIT);
    });

    it("should return entries in most-recent-first order", () => {
      const { result } = renderHook(() => useSearchHistoryStore());

      const terms = ["alpha", "bravo", "charlie", "delta"];
      act(() => {
        terms.forEach((term) => result.current.addSearchTerm(term));
      });

      const recent = result.current.getRecentSearches();
      const returnedTerms = recent.map((e) => e.term);

      expect(returnedTerms).toEqual(terms.reverse());
    });
  });

  describe("store subscription", () => {
    it("should notify subscribers when state changes", () => {
      const { result } = renderHook(() => useSearchHistoryStore());
      let subscriberCalled = false;

      const unsubscribe = useSearchHistoryStore.subscribe(() => {
        subscriberCalled = true;
      });

      act(() => {
        result.current.addSearchTerm("new search");
      });

      expect(subscriberCalled).toBe(true);
      unsubscribe();
    });
  });
});
