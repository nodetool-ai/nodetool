import { renderHook, waitFor } from "@testing-library/react";
import { useAssetImageEditor } from "../useAssetImageEditor";
import { useAssetStore } from "../../../stores/AssetStore";
import { Asset } from "../../../stores/ApiTypes";

// Mock the AssetStore
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: jest.fn()
}));

describe("useAssetImageEditor", () => {
  let mockUpdate: jest.Mock;
  let mockInvalidateQueries: jest.Mock;

  const createMockAsset = (id: string, parentId?: string | null): Asset => ({
    id,
    user_id: "user123",
    workflow_id: null,
    parent_id: parentId !== undefined ? (parentId || "") : "parent123",
    name: `test-image-${id}.png`,
    content_type: "image/png",
    metadata: null,
    created_at: "2024-01-01T00:00:00Z",
    get_url: `http://example.com/assets/${id}`,
    thumb_url: null,
    duration: null
  });

  beforeEach(() => {
    mockUpdate = jest.fn().mockResolvedValue({});
    mockInvalidateQueries = jest.fn();

    // Mock the useAssetStore hook to return our mock functions
    (useAssetStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        update: mockUpdate,
        invalidateQueries: mockInvalidateQueries
      };
      return selector(state);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should save edited image with base64 data", async () => {
    const { result } = renderHook(() => useAssetImageEditor());
    
    const mockAsset = createMockAsset("asset123");
    const mockBlob = new Blob(["fake image data"], { type: "image/png" });

    // Create a mock for FileReader
    const mockFileReader = {
      readAsDataURL: jest.fn(),
      onloadend: null as ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null,
      result: "data:image/png;base64,ZmFrZSBpbWFnZSBkYXRh"
    };

    global.FileReader = jest.fn(() => mockFileReader) as unknown as typeof FileReader;

    // Call saveEditedImage
    const savePromise = result.current.saveEditedImage(mockAsset, mockBlob);

    // Trigger the onloadend callback
    if (mockFileReader.onloadend) {
      mockFileReader.onloadend.call(mockFileReader as unknown as FileReader, {} as ProgressEvent<FileReader>);
    }

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        id: "asset123",
        data: "data:image/png;base64,ZmFrZSBpbWFnZSBkYXRh"
      });
    });

    await savePromise;

    // Verify cache invalidation was called
    expect(mockInvalidateQueries).toHaveBeenCalledWith(["assets", "asset123"]);
    expect(mockInvalidateQueries).toHaveBeenCalledWith(["assets", { parent_id: "parent123" }]);
  });

  test("should invalidate cache for asset without parent_id", async () => {
    const { result } = renderHook(() => useAssetImageEditor());
    
    const mockAsset = createMockAsset("asset456", "");
    const mockBlob = new Blob(["fake image data"], { type: "image/png" });

    const mockFileReader = {
      readAsDataURL: jest.fn(),
      onloadend: null as ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null,
      result: "data:image/png;base64,ZmFrZSBpbWFnZSBkYXRh"
    };

    global.FileReader = jest.fn(() => mockFileReader) as unknown as typeof FileReader;

    const savePromise = result.current.saveEditedImage(mockAsset, mockBlob);

    if (mockFileReader.onloadend) {
      mockFileReader.onloadend.call(mockFileReader as unknown as FileReader, {} as ProgressEvent<FileReader>);
    }

    await savePromise;

    // Verify only asset-specific cache was invalidated (no parent folder invalidation)
    expect(mockInvalidateQueries).toHaveBeenCalledWith(["assets", "asset456"]);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  test("should handle errors during save", async () => {
    const { result } = renderHook(() => useAssetImageEditor());
    
    const mockAsset = createMockAsset("asset789");
    const mockBlob = new Blob(["fake image data"], { type: "image/png" });

    // Mock update to throw an error
    const testError = new Error("Network error");
    mockUpdate.mockRejectedValue(testError);

    const mockFileReader = {
      readAsDataURL: jest.fn(),
      onloadend: null as ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null,
      result: "data:image/png;base64,ZmFrZSBpbWFnZSBkYXRh"
    };

    global.FileReader = jest.fn(() => mockFileReader) as unknown as typeof FileReader;

    const savePromise = result.current.saveEditedImage(mockAsset, mockBlob);

    if (mockFileReader.onloadend) {
      mockFileReader.onloadend.call(mockFileReader as unknown as FileReader, {} as ProgressEvent<FileReader>);
    }

    // Expect the promise to reject
    await expect(savePromise).rejects.toThrow("Network error");

    // Verify cache was not invalidated
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  test("should have isProcessing set to false", () => {
    const { result } = renderHook(() => useAssetImageEditor());
    
    expect(result.current.isProcessing).toBe(false);
  });
});
