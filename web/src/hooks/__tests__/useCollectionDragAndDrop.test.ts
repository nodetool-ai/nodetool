import { renderHook, act } from "@testing-library/react";
import * as React from "react";
import { client } from "../../stores/ApiClient";
import { useCollectionDragAndDrop } from "../useCollectionDragAndDrop";

jest.mock("../../stores/ApiClient", () => ({
  client: {
    POST: jest.fn()
  }
}));

const mockQueryClient = {
  invalidateQueries: jest.fn()
};

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient
}));

describe("useCollectionDragAndDrop", () => {
  const mockSetDragOverCollection = jest.fn();
  const mockSetIndexProgress = jest.fn();
  const mockSetIndexErrors = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    jest.spyOn(React, "useState")
      .mockImplementation(((initial: any) => {
        if (initial === null) {
          return [null, mockSetDragOverCollection];
        }
        if (Array.isArray(initial)) {
          return [initial, mockSetIndexErrors];
        }
        return [null, mockSetIndexProgress];
      }) as any);
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
      
      expect(mockSetDragOverCollection).toHaveBeenCalledWith("test-collection");
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
        
        expect(mockSetDragOverCollection).toHaveBeenCalledWith(collectionName);
      });
    });
  });

  describe("handleDragLeave", () => {
    it("clears dragOverCollection when leaving drag area", () => {
      const { result } = renderHook(() => useCollectionDragAndDrop());
      
      const mockEvent = {
        preventDefault: jest.fn()
      };
      
      act(() => {
        result.current.handleDragLeave(mockEvent as any);
      });
      
      expect(mockSetDragOverCollection).toHaveBeenCalledWith(null);
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
      expect(mockSetDragOverCollection).toHaveBeenCalledWith(null);
      expect(mockSetIndexErrors).toHaveBeenCalledWith([]);
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
      
      expect(mockSetIndexErrors).toHaveBeenCalled();
      const errorsArg = mockSetIndexErrors.mock.calls[mockSetIndexErrors.mock.calls.length - 1][0];
      expect(errorsArg).toHaveLength(1);
      expect(errorsArg[0].file).toBe("error-file.txt");
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
      
      expect(mockSetIndexErrors).toHaveBeenCalled();
      const errorsArg = mockSetIndexErrors.mock.calls[mockSetIndexErrors.mock.calls.length - 1][0];
      expect(errorsArg).toHaveLength(1);
      expect(errorsArg[0].file).toBe("crash-file.txt");
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
      
      expect(mockSetIndexErrors).toHaveBeenCalledWith([]);
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
