import { renderHook } from "@testing-library/react";
import { useAssetById } from "../useAssetById";
import { useQuery } from "@tanstack/react-query";
import { mockAsset } from "../../__mocks__/fixtures";

const mockGetAsset = jest.fn();
jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn((selector: any) => selector({ get: mockGetAsset }))
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn()
}));

describe("useAssetById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({ data: mockAsset });
  });

  it("returns asset when valid ID provided", () => {
    const { result } = renderHook(() => useAssetById("asset-123"));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["asset", "asset-123"],
        enabled: true
      })
    );
    expect(result.current.data).toEqual(mockAsset);
  });

  it("query is disabled when no asset ID provided", () => {
    renderHook(() => useAssetById(undefined));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["asset", undefined],
        enabled: false
      })
    );
  });

  it("throws error when queryFn is called without asset ID", async () => {
    let capturedQueryFn: any;
    (useQuery as jest.Mock).mockImplementation((config) => {
      capturedQueryFn = config.queryFn;
      return { data: undefined };
    });

    renderHook(() => useAssetById(undefined));
    
    await expect(capturedQueryFn()).rejects.toThrow("Asset ID is required");
  });

  it("calls getAsset with correct ID", async () => {
    let capturedQueryFn: any;
    mockGetAsset.mockResolvedValue(mockAsset);
    (useQuery as jest.Mock).mockImplementation((config) => {
      capturedQueryFn = config.queryFn;
      return { data: mockAsset };
    });

    renderHook(() => useAssetById("asset-456"));
    
    await capturedQueryFn();
    expect(mockGetAsset).toHaveBeenCalledWith("asset-456");
  });
});
