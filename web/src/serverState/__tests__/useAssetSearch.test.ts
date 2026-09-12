import { renderHook, act } from "@testing-library/react";

const mockSearch = jest.fn();
let mockProjectId = "project-a";

jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn(
    (selector: (state: { search: typeof mockSearch }) => unknown) =>
      selector({ search: mockSearch })
  )
}));

jest.mock("../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "default",
  useWorkspaceTabsStore: <T>(
    selector: (state: {
      activeProjectId: string | null;
      personalProjectId: string | null;
    }) => T
  ) => selector({ activeProjectId: null, personalProjectId: mockProjectId })
}));

import { useAssetSearch } from "../useAssetSearch";

describe("useAssetSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectId = "project-a";
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

    let searchResult: Awaited<ReturnType<typeof result.current.searchAssets>> | undefined;
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

    let searchResult: Awaited<ReturnType<typeof result.current.searchAssets>> | undefined;
    await act(async () => {
      searchResult = await result.current.searchAssets("");
    });

    expect(searchResult).toBeNull();
    expect(result.current.searchError).toBeDefined();
  });

  it("rejects whitespace-only queries", async () => {
    const { result } = renderHook(() => useAssetSearch());

    let searchResult: Awaited<ReturnType<typeof result.current.searchAssets>> | undefined;
    await act(async () => {
      searchResult = await result.current.searchAssets("   ");
    });

    expect(searchResult).toBeNull();
  });

  it("performs search with valid query", async () => {
    const { result } = renderHook(() => useAssetSearch());

    let searchResult: Awaited<ReturnType<typeof result.current.searchAssets>> | undefined;
    await act(async () => {
      searchResult = await result.current.searchAssets("test query");
    });

    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [searchInput, searchSignal] = mockSearch.mock.calls[0];
    expect(searchInput).toEqual({
      query: "test query",
      content_type: undefined,
      page_size: 100,
      cursor: undefined,
      project_id: "project-a"
    });
    expect(searchSignal).toBeInstanceOf(AbortSignal);
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

    const [searchInput, searchSignal] = mockSearch.mock.calls[0];
    expect(searchInput.query).toBe("hello world");
    expect(searchSignal).toBeInstanceOf(AbortSignal);
  });

  it("passes content type filter", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("test", "image/png");
    });

    const [searchInput, searchSignal] = mockSearch.mock.calls[0];
    expect(searchInput.content_type).toBe("image/png");
    expect(searchSignal).toBeInstanceOf(AbortSignal);
  });

  it("passes page size parameter", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("test", undefined, 50);
    });

    const [searchInput, searchSignal] = mockSearch.mock.calls[0];
    expect(searchInput.page_size).toBe(50);
    expect(searchSignal).toBeInstanceOf(AbortSignal);
  });

  it("passes cursor parameter", async () => {
    const { result } = renderHook(() => useAssetSearch());

    await act(async () => {
      await result.current.searchAssets("test", undefined, 100, "cursor-abc");
    });

    const [searchInput, searchSignal] = mockSearch.mock.calls[0];
    expect(searchInput.cursor).toBe("cursor-abc");
    expect(searchSignal).toBeInstanceOf(AbortSignal);
  });

  it("sets error on search failure", async () => {
    mockSearch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAssetSearch());

    let searchResult: Awaited<ReturnType<typeof result.current.searchAssets>> | undefined;
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

    let searchResult: Awaited<ReturnType<typeof result.current.searchAssets>> | undefined;
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

  it("clears loading when a project switch aborts the active search", async () => {
    mockSearch.mockImplementationOnce(
      (_query: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const { result, rerender } = renderHook(() => useAssetSearch());

    let pendingSearch!: Promise<unknown>;
    act(() => {
      pendingSearch = result.current.searchAssets("test");
    });
    expect(result.current.isSearching).toBe(true);

    mockProjectId = "project-b";
    rerender();
    await act(async () => {
      await pendingSearch;
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchError).toBeNull();
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
