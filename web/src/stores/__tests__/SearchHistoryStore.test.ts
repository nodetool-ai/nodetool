import { renderHook, act } from "@testing-library/react";
import { useSearchHistoryStore } from "../SearchHistoryStore";

describe("SearchHistoryStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    const { result } = renderHook(() => useSearchHistoryStore());
    act(() => {
      result.current.clearHistory();
    });
  });

  it("should initialize with empty history", () => {
    const { result } = renderHook(() => useSearchHistoryStore());
    expect(result.current.history).toEqual([]);
  });

  it("should add search term to history", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      result.current.addSearchTerm("test search");
    });

    expect(result.current.history).toEqual(["test search"]);
  });

  it("should not add empty or whitespace-only terms", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      result.current.addSearchTerm("");
      result.current.addSearchTerm("   ");
      result.current.addSearchTerm("valid search");
    });

    expect(result.current.history).toEqual(["valid search"]);
  });

  it("should trim whitespace from search terms", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      result.current.addSearchTerm("  test search  ");
    });

    expect(result.current.history).toEqual(["test search"]);
  });

  it("should move existing term to front when re-adding", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      result.current.addSearchTerm("first");
      result.current.addSearchTerm("second");
      result.current.addSearchTerm("third");
      result.current.addSearchTerm("first");
    });

    // First is moved to the front, third and second remain in order
    expect(result.current.history).toEqual(["first", "third", "second"]);
  });

  it("should limit history to maximum size", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      for (let i = 1; i <= 15; i++) {
        result.current.addSearchTerm(`search ${i}`);
      }
    });

    // Should only keep the 10 most recent (in reverse order - most recent first)
    expect(result.current.history.length).toBe(10);
    expect(result.current.history[0]).toBe("search 15");
    expect(result.current.history[9]).toBe("search 6");
  });

  it("should remove specific search term", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      result.current.addSearchTerm("first");
      result.current.addSearchTerm("second");
      result.current.addSearchTerm("third");
    });

    act(() => {
      result.current.removeSearchTerm("second");
    });

    expect(result.current.history).toEqual(["third", "first"]);
  });

  it("should clear all history", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      result.current.addSearchTerm("first");
      result.current.addSearchTerm("second");
      result.current.addSearchTerm("third");
    });

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
  });

  it("should get recent searches with default limit", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      for (let i = 1; i <= 5; i++) {
        result.current.addSearchTerm(`search ${i}`);
      }
    });

    const recent = result.current.getRecentSearches();
    expect(recent).toEqual(["search 5", "search 4", "search 3", "search 2", "search 1"]);
  });

  it("should get recent searches with custom limit", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      for (let i = 1; i <= 5; i++) {
        result.current.addSearchTerm(`search ${i}`);
      }
    });

    const recent = result.current.getRecentSearches(3);
    expect(recent).toEqual(["search 5", "search 4", "search 3"]);
  });

  it("should handle case-sensitive terms correctly", () => {
    const { result } = renderHook(() => useSearchHistoryStore());

    act(() => {
      result.current.addSearchTerm("Test");
      result.current.addSearchTerm("test");
      result.current.addSearchTerm("TEST");
    });

    expect(result.current.history).toEqual(["TEST", "test", "Test"]);
  });
});
