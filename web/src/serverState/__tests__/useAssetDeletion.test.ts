import { renderHook, act } from "@testing-library/react";

const mockDeleteAsset = jest.fn();
const mockAddNotification = jest.fn();
const mockMutate = jest.fn();
const mockReset = jest.fn();

jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn((selector: any) =>
    selector({ delete: mockDeleteAsset })
  )
}));

jest.mock("../../stores/NotificationStore", () => ({
  __esModule: true,
  useNotificationStore: jest.fn((selector: any) =>
    selector({ addNotification: mockAddNotification })
  )
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useMutation: jest.fn((config: any) => ({
    mutateAsync: config.mutationFn,
    mutate: mockMutate,
    reset: mockReset,
    isPending: false,
    isError: false,
    isSuccess: false,
    ...config
  }))
}));

import { useAssetDeletion } from "../useAssetDeletion";

describe("useAssetDeletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteAsset.mockResolvedValue("deleted-id");
  });

  it("returns a mutation object", () => {
    const { result } = renderHook(() => useAssetDeletion());
    expect(result.current.mutation).toBeDefined();
  });

  it("calls deleteAsset for each asset id", async () => {
    mockDeleteAsset
      .mockResolvedValueOnce("id-1")
      .mockResolvedValueOnce("id-2");

    const { result } = renderHook(() => useAssetDeletion());
    let deleted: any;
    await act(async () => {
      deleted = await result.current.mutation.mutateAsync(["id-1", "id-2"]);
    });

    expect(mockDeleteAsset).toHaveBeenCalledTimes(2);
    expect(mockDeleteAsset).toHaveBeenCalledWith("id-1");
    expect(mockDeleteAsset).toHaveBeenCalledWith("id-2");
    expect(deleted.deleted_asset_ids).toEqual(["id-1", "id-2"]);
  });

  it("handles single asset deletion", async () => {
    mockDeleteAsset.mockResolvedValueOnce("only-id");

    const { result } = renderHook(() => useAssetDeletion());
    let deleted: any;
    await act(async () => {
      deleted = await result.current.mutation.mutateAsync(["only-id"]);
    });

    expect(mockDeleteAsset).toHaveBeenCalledTimes(1);
    expect(deleted.deleted_asset_ids).toEqual(["only-id"]);
  });

  it("handles empty array", async () => {
    const { result } = renderHook(() => useAssetDeletion());
    let deleted: any;
    await act(async () => {
      deleted = await result.current.mutation.mutateAsync([]);
    });

    expect(mockDeleteAsset).not.toHaveBeenCalled();
    expect(deleted.deleted_asset_ids).toEqual([]);
  });

  it("configures onSuccess to show info notification", () => {
    const { result } = renderHook(() => useAssetDeletion());
    const config = result.current.mutation as any;

    config.onSuccess({ deleted_asset_ids: ["a", "b"] });
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        content: "Assets deleted!"
      })
    );
  });

  it("shows singular message for single asset deletion", () => {
    const { result } = renderHook(() => useAssetDeletion());
    const config = result.current.mutation as any;

    config.onSuccess({ deleted_asset_ids: ["a"] });
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Asset deleted!"
      })
    );
  });

  it("configures onError to show error notification", () => {
    const { result } = renderHook(() => useAssetDeletion());
    const config = result.current.mutation as any;

    config.onError(new Error("fail"));
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: "Error deleting assets."
      })
    );
  });
});
