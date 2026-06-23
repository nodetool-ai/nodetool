import { renderHook } from "@testing-library/react";
import { useJobAssets } from "../useJobAssets";
import { useQuery } from "@tanstack/react-query";
import { mockAsset } from "../../__mocks__/fixtures";

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

describe("useJobAssets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({ data: [mockAsset] });
  });

  it("passes job_id in the query key", () => {
    renderHook(() => useJobAssets("job-123"));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["assets", { job_id: "job-123" }]
      })
    );
  });

  it("enables the query when jobId is provided", () => {
    renderHook(() => useJobAssets("job-123"));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true
      })
    );
  });

  it("disables the query when jobId is empty", () => {
    renderHook(() => useJobAssets(""));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false
      })
    );
  });

  it("sets a 5-minute staleTime", () => {
    renderHook(() => useJobAssets("job-456"));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        staleTime: 1000 * 60 * 5
      })
    );
  });

  it("returns query result from useQuery", () => {
    const mockData = [mockAsset];
    (useQuery as jest.Mock).mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null
    });
    const { result } = renderHook(() => useJobAssets("job-789"));
    expect(result.current.data).toEqual(mockData);
    expect(result.current.isLoading).toBe(false);
  });
});
