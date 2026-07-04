import { renderHook, act } from "@testing-library/react";

const mockUpdateAsset = jest.fn();
const mockAddNotification = jest.fn();
const mockMutate = jest.fn();
const mockReset = jest.fn();
const mockCancelQueries = jest.fn();
const mockSetQueryData = jest.fn();
const mockGetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ update: mockUpdateAsset })
  )
}));

jest.mock("../../stores/NotificationStore", () => ({
  __esModule: true,
  useNotificationStore: jest.fn(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ addNotification: mockAddNotification })
  )
}));

jest.mock("../../stores/AssetGridStore", () => ({
  __esModule: true,
  useAssetGridStore: {
    getState: jest.fn(() => ({ currentFolderId: "folder-1" }))
  },
  useAssetGridStoreApi: jest.fn(() => ({
    getState: jest.fn(() => ({ currentFolderId: "folder-1" }))
  }))
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useMutation: jest.fn((config: Record<string, unknown>) => ({
    mutateAsync: config.mutationFn as (...args: unknown[]) => Promise<unknown>,
    mutate: mockMutate,
    reset: mockReset,
    isPending: false,
    isError: false,
    isSuccess: false,
    ...config
  })),
  useQueryClient: jest.fn(() => ({
    cancelQueries: mockCancelQueries,
    setQueryData: mockSetQueryData,
    getQueryData: mockGetQueryData,
    invalidateQueries: mockInvalidateQueries
  }))
}));

import { useAssetUpdate } from "../useAssetUpdate";

describe("useAssetUpdate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateAsset.mockResolvedValue(undefined);
    mockCancelQueries.mockResolvedValue(undefined);
  });

  it("returns a mutation object", () => {
    const { result } = renderHook(() => useAssetUpdate());
    expect(result.current.mutation).toBeDefined();
  });

  it("calls updateAsset for each update", async () => {
    mockUpdateAsset.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAssetUpdate());
    await act(async () => {
      await result.current.mutation.mutateAsync([
        { id: "a1", parent_id: "folder-2" },
        { id: "a2", parent_id: "folder-2" }
      ]);
    });
    expect(mockUpdateAsset).toHaveBeenCalledTimes(2);
    expect(mockUpdateAsset).toHaveBeenCalledWith({
      id: "a1",
      parent_id: "folder-2"
    });
    expect(mockUpdateAsset).toHaveBeenCalledWith({
      id: "a2",
      parent_id: "folder-2"
    });
  });

  it("shows success notification via onSuccess", () => {
    const { result } = renderHook(() => useAssetUpdate());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = result.current.mutation as any;
    config.onSuccess(undefined, [{ id: "a1" }], undefined);
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        content: "Asset updated!"
      })
    );
  });

  it("pluralizes notification for multiple assets", () => {
    const { result } = renderHook(() => useAssetUpdate());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = result.current.mutation as any;
    config.onSuccess(undefined, [{ id: "a1" }, { id: "a2" }], undefined);
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Assets updated!"
      })
    );
  });

  it("shows error notification via onError", () => {
    const { result } = renderHook(() => useAssetUpdate());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = result.current.mutation as any;
    config.onError(new Error("fail"), [], {});
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: "Error updating asset."
      })
    );
  });

  it("invalidates queries via onSettled", () => {
    const { result } = renderHook(() => useAssetUpdate());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = result.current.mutation as any;
    config.onSettled(undefined, null, [], {
      currentFolderId: "folder-1"
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["assets", { parent_id: "folder-1" }]
      })
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["folderTree"] })
    );
  });
});
