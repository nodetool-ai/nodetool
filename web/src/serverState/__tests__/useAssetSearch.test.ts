import { renderHook, act } from "@testing-library/react";

const mockSearch = jest.fn();

jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn((selector: any) =>
    selector({ search: mockSearch })
  )
}));

import { useAssetSearch } from "../useAssetSearch";

describe("useAssetSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockResolvedValue({
      assets: [{ id: "1", name: "test.png" }],
      next_cursor: null
    });
  });

  it("returns initial state", () => {
    const { result } = renderHook(() => useAssetSearch());
    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchError).toBeNull();
  });

  it("rejects queries shorter than 2 characters", async () => {
    const { result } = renderHook(() => useAssetSearch());

    let searchResult: any;
    await act(async () => {
      searchResult = await result.current.searchAssets("a");
    });

    expect(searchResult).toBeNull();
    expect(result.current.searchError).toBe(
      "Search query must be at least 2 characters long"
    );
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("rejects empty string queries", async () => {
    const { result } = renderHook(() => useAssetSearch());

    let searchResult: any;
    await act(async () => {
      searchResult = await result.current.searchAssets("");
    });

    expect(searchResult).toBeNull();
    expect(result.current.searchError).toBeDefined();
  });

  it("rejects whitespace-only queries", async () => {
    const { result } = renderHook(() => useAssetSearch());

    let searchResult: any;
    await act(async () => {
      searchResult = await result.current.searchAssets("   ");
    });

    expect(searchResult).toBeNull();
  });

  it("performs search with valid query", async () => {
    const { result } = renderHook(() => useAssetSearch());

    let searchResult: any;
    await act(async () => {
      searchResult = await result.current.searchAssets("test query");
    });

    expect(mockSearch).toHaveBeenCalledWith({
      query: "test query",
      content_type: undefined,
      page_size: 100,
      cursor: undefined
    });
    expect(searchResult).toEqual({
      assets: [{ id: "1", name: "test.png" }],
      next_cursor: null
    });
  });

  it("trims whitespace from query", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("  hello world  ");
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "hello world" })
    );
  });

  it("passes content type filter", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("test", "image/png");
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ content_type: "image/png" })
    );
  });

  it("passes page size parameter", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("test", undefined, 50);
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ page_size: 50 })
    );
  });

  it("passes cursor parameter", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("test", undefined, 100, "cursor-abc");
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "cursor-abc" })
    );
  });

  it("sets error on search failure", async () => {
    mockSearch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAssetSearch());

    let searchResult: any;
    await act(async () => {
      searchResult = await result.current.searchAssets("test");
    });

    expect(searchResult).toBeNull();
    expect(result.current.searchError).toBe("Network error");
  });

  it("uses generic message for non-Error thrown values", async () => {
    mockSearch.mockRejectedValueOnce("something went wrong");

    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("test");
    });

    expect(result.current.searchError).toBe(
      "An error occurred while searching assets"
    );
  });

  it("returns null when abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const { result } = renderHook(() => useAssetSearch());

    let searchResult: any;
    await act(async () => {
      searchResult = await result.current.searchAssets(
        "test",
        undefined,
        100,
        undefined,
        controller.signal
      );
    });

    expect(searchResult).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("clearError resets searchError to null", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("a");
    });
    expect(result.current.searchError).not.toBeNull();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.searchError).toBeNull();
  });
});
