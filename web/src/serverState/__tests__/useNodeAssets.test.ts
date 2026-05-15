import { renderHook } from "@testing-library/react";

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn()
}));

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    assets: {
      list: {
        query: jest.fn()
      }
    }
  }
}));

jest.mock("../../utils/normalizeAsset", () => ({
  normalizeAssetList: jest.fn((assets: unknown[]) => assets)
}));

import { useQuery } from "@tanstack/react-query";
import { useNodeAssets } from "../useNodeAssets";

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

describe("useNodeAssets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null
    } as any);
  });

  it("disables the query when nodeId is null", () => {
    renderHook(() => useNodeAssets(null));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("disables the query when enabled is false (default)", () => {
    renderHook(() => useNodeAssets("node-1"));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("enables the query when nodeId is provided and enabled is true", () => {
    renderHook(() => useNodeAssets("node-1", true));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );
  });

  it("stays disabled when nodeId is null even if enabled is true", () => {
    renderHook(() => useNodeAssets(null, true));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("uses the correct query key", () => {
    renderHook(() => useNodeAssets("node-abc", true));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["assets", { node_id: "node-abc" }]
      })
    );
  });

  it("sets staleTime to 1 minute", () => {
    renderHook(() => useNodeAssets("node-1", true));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ staleTime: 60000 })
    );
  });

  it("returns the query result directly", () => {
    const mockResult = {
      data: [{ id: "asset-1", name: "test.png" }],
      isLoading: false,
      error: null
    };
    mockUseQuery.mockReturnValue(mockResult as any);

    const { result } = renderHook(() => useNodeAssets("node-1", true));
    expect(result.current).toEqual(mockResult);
  });

  it("provides a queryFn that resolves to empty array when nodeId is null", async () => {
    renderHook(() => useNodeAssets(null, true));
    const queryConfig = mockUseQuery.mock.calls[0][0] as any;
    const result = await queryConfig.queryFn();
    expect(result).toEqual([]);
  });
});
