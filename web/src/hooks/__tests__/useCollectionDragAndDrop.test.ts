import { renderHook, act } from "@testing-library/react";
import { client } from "../../stores/ApiClient";
import { useCollectionDragAndDrop } from "../useCollectionDragAndDrop";

jest.mock("../../stores/ApiClient", () => ({
  client: {
    POST: jest.fn()
  }
}));

jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

const mockQueryClient = {
  invalidateQueries: jest.fn()
};

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient
}));

describe("useCollectionDragAndDrop", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handleDragOver", () => {
    it("sets dragOverCollection when dragging over a collection", () => {
      const { result } = renderHook(() => useCollectionDragAndDrop());

      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [] }
      };

      act(() => {
        result.current.handleDragOver(mockEvent as any, "test-collection");
      });

      expect(result.current.dragOverCollection).toBe("test-collection");
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it("handles different collection names", () => {
      const { result } = renderHook(() => useCollectionDragAndDrop());

      const collections = ["collection1", "collection2", "nested/path"];

      collections.forEach((collectionName) => {
        const mockEvent = {
          preventDefault: jest.fn(),
          dataTransfer: { files: [] }
        };

        act(() => {
          result.current.handleDragOver(mockEvent as any, collectionName);
        });

        expect(result.current.dragOverCollection).toBe(collectionName);
      });
    });
  });

  describe("handleDragLeave", () => {
    it("clears dragOverCollection when leaving drag area", () => {
      const { result } = renderHook(() => useCollectionDragAndDrop());

      // First set a collection
      act(() => {
        result.current.handleDragOver({ preventDefault: jest.fn() } as any, "test");
      });
      expect(result.current.dragOverCollection).toBe("test");

      const mockEvent = {
        preventDefault: jest.fn()
      };

      act(() => {
        result.current.handleDragLeave(mockEvent as any);
      });

      expect(result.current.dragOverCollection).toBeNull();
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe("handleDrop", () => {
    it("returns early when no files are dropped", async () => {
      const { result } = renderHook(() => useCollectionDragAndDrop());

      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [] }
      };

      await act(async () => {
        await result.current.handleDrop("test-collection")(mockEvent as any);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(result.current.dragOverCollection).toBeNull();
      expect(result.current.indexErrors).toEqual([]);
    });

    it("processes files and calls API for each file", async () => {
      const mockFiles = [
        new File(["content"], "file1.txt", { type: "text/plain" }),
        new File(["content"], "file2.txt", { type: "text/plain" })
      ];

      (client.POST as jest.Mock).mockResolvedValue({
        data: { path: "test-collection", error: null },
        error: null
      });

      const { result } = renderHook(() => useCollectionDragAndDrop());

      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: { files: mockFiles }
      };

      await act(async () => {
        await result.current.handleDrop("test-collection")(mockEvent as any);
      });

      expect(client.POST).toHaveBeenCalledTimes(2);
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["collections"] });
    });

    it("handles API errors for individual files", async () => {
      const mockFile = new File(["content"], "error-file.txt", { type: "text/plain" });

      (client.POST as jest.Mock).mockResolvedValue({
        data: { path: "test-collection", error: "File processing failed" },
        error: { detail: [{ msg: "Processing error", loc: ["body"], type: "error" }] }
      });

      const { result } = renderHook(() => useCollectionDragAndDrop());

      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [mockFile] }
      };

      await act(async () => {
        await result.current.handleDrop("test-collection")(mockEvent as any);
      });

      expect(result.current.indexErrors).toHaveLength(1);
      expect(result.current.indexErrors[0].file).toBe("error-file.txt");
    });

    it("handles exceptions during file processing", async () => {
      const mockFile = new File(["content"], "crash-file.txt", { type: "text/plain" });

      (client.POST as jest.Mock).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useCollectionDragAndDrop());

      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [mockFile] }
      };

      await act(async () => {
        await result.current.handleDrop("test-collection")(mockEvent as any);
      });

      expect(result.current.indexErrors).toHaveLength(1);
      expect(result.current.indexErrors[0].file).toBe("crash-file.txt");
    });

    it("clears previous errors before processing new files", async () => {
      const mockFile = new File(["content"], "new-file.txt", { type: "text/plain" });

      (client.POST as jest.Mock).mockResolvedValue({
        data: { path: "test-collection", error: null },
        error: null
      });

      const { result } = renderHook(() => useCollectionDragAndDrop());

      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [mockFile] }
      };

      await act(async () => {
        await result.current.handleDrop("test-collection")(mockEvent as any);
      });

      expect(result.current.indexErrors).toEqual([]);
    });
  });

  describe("return values", () => {
    it("returns all required callback functions and state", () => {
      const { result } = renderHook(() => useCollectionDragAndDrop());

      expect(result.current.handleDrop).toBeDefined();
      expect(typeof result.current.handleDrop("test")).toBe("function");

      expect(result.current.handleDragOver).toBeDefined();
      expect(typeof result.current.handleDragOver).toBe("function");

      expect(result.current.handleDragLeave).toBeDefined();
      expect(typeof result.current.handleDragLeave).toBe("function");

      expect(result.current.setIndexErrors).toBeDefined();
      expect(typeof result.current.setIndexErrors).toBe("function");
    });

    it("initializes state correctly", () => {
      const { result } = renderHook(() => useCollectionDragAndDrop());

      expect(result.current.dragOverCollection).toBeNull();
      expect(result.current.indexProgress).toBeNull();
      expect(result.current.indexErrors).toEqual([]);
    });
  });
});
