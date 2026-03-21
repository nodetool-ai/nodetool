import { act } from "@testing-library/react";
import { useCollectionStore } from "../CollectionStore";
import { client } from "../ApiClient";

// Mock the client module
jest.mock("../ApiClient", () => ({
  client: {
    GET: jest.fn(),
    POST: jest.fn(),
    DELETE: jest.fn()
  }
}));

// Use 'any' to bypass strict typing for mocked API responses
const mockClient = client as any;

describe("CollectionStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useCollectionStore.setState({
      collections: null,
      isLoading: false,
      error: null,
      deleteTarget: null,
      showForm: false,
      dragOverCollection: null,
      indexProgress: null,
      indexErrors: [],
      selectedCollections: []
    });
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("has null collections initially", () => {
      const { collections } = useCollectionStore.getState();
      expect(collections).toBeNull();
    });

    it("is not loading initially", () => {
      const { isLoading } = useCollectionStore.getState();
      expect(isLoading).toBe(false);
    });

    it("has no error initially", () => {
      const { error } = useCollectionStore.getState();
      expect(error).toBeNull();
    });

    it("has no delete target initially", () => {
      const { deleteTarget } = useCollectionStore.getState();
      expect(deleteTarget).toBeNull();
    });

    it("has showForm set to false initially", () => {
      const { showForm } = useCollectionStore.getState();
      expect(showForm).toBe(false);
    });

    it("has no dragOverCollection initially", () => {
      const { dragOverCollection } = useCollectionStore.getState();
      expect(dragOverCollection).toBeNull();
    });

    it("has no indexProgress initially", () => {
      const { indexProgress } = useCollectionStore.getState();
      expect(indexProgress).toBeNull();
    });

    it("has empty indexErrors initially", () => {
      const { indexErrors } = useCollectionStore.getState();
      expect(indexErrors).toEqual([]);
    });

    it("has empty selectedCollections initially", () => {
      const { selectedCollections } = useCollectionStore.getState();
      expect(selectedCollections).toEqual([]);
    });
  });

  describe("setCollections", () => {
    it("sets collections", () => {
      const collections = { 
        collections: [{ name: "test", count: 5, metadata: {} }],
        count: 1
      };

      act(() => {
        useCollectionStore.getState().setCollections(collections);
      });

      expect(useCollectionStore.getState().collections).toEqual(collections);
    });
  });

  describe("setIsLoading", () => {
    it("sets isLoading to true", () => {
      act(() => {
        useCollectionStore.getState().setIsLoading(true);
      });

      expect(useCollectionStore.getState().isLoading).toBe(true);
    });

    it("sets isLoading to false", () => {
      act(() => {
        useCollectionStore.getState().setIsLoading(true);
        useCollectionStore.getState().setIsLoading(false);
      });

      expect(useCollectionStore.getState().isLoading).toBe(false);
    });
  });

  describe("setError", () => {
    it("sets error message", () => {
      act(() => {
        useCollectionStore.getState().setError("Test error");
      });

      expect(useCollectionStore.getState().error).toBe("Test error");
    });

    it("clears error when set to null", () => {
      act(() => {
        useCollectionStore.getState().setError("Test error");
        useCollectionStore.getState().setError(null);
      });

      expect(useCollectionStore.getState().error).toBeNull();
    });
  });

  describe("setDeleteTarget", () => {
    it("sets delete target", () => {
      act(() => {
        useCollectionStore.getState().setDeleteTarget("collection1");
      });

      expect(useCollectionStore.getState().deleteTarget).toBe("collection1");
    });

    it("clears delete target", () => {
      act(() => {
        useCollectionStore.getState().setDeleteTarget("collection1");
        useCollectionStore.getState().setDeleteTarget(null);
      });

      expect(useCollectionStore.getState().deleteTarget).toBeNull();
    });
  });

  describe("setShowForm", () => {
    it("sets showForm to true", () => {
      act(() => {
        useCollectionStore.getState().setShowForm(true);
      });

      expect(useCollectionStore.getState().showForm).toBe(true);
    });

    it("sets showForm to false", () => {
      act(() => {
        useCollectionStore.getState().setShowForm(true);
        useCollectionStore.getState().setShowForm(false);
      });

      expect(useCollectionStore.getState().showForm).toBe(false);
    });
  });

  describe("setDragOverCollection", () => {
    it("sets dragOverCollection", () => {
      act(() => {
        useCollectionStore.getState().setDragOverCollection("collection1");
      });

      expect(useCollectionStore.getState().dragOverCollection).toBe("collection1");
    });

    it("clears dragOverCollection", () => {
      act(() => {
        useCollectionStore.getState().setDragOverCollection("collection1");
        useCollectionStore.getState().setDragOverCollection(null);
      });

      expect(useCollectionStore.getState().dragOverCollection).toBeNull();
    });
  });

  describe("setIndexProgress", () => {
    it("sets indexProgress", () => {
      const progress = {
        collection: "test",
        current: 5,
        total: 10,
        startTime: Date.now()
      };

      act(() => {
        useCollectionStore.getState().setIndexProgress(progress);
      });

      expect(useCollectionStore.getState().indexProgress).toEqual(progress);
    });

    it("clears indexProgress", () => {
      const progress = {
        collection: "test",
        current: 5,
        total: 10,
        startTime: Date.now()
      };

      act(() => {
        useCollectionStore.getState().setIndexProgress(progress);
        useCollectionStore.getState().setIndexProgress(null);
      });

      expect(useCollectionStore.getState().indexProgress).toBeNull();
    });
  });

  describe("setIndexErrors", () => {
    it("sets indexErrors", () => {
      const errors = [
        { file: "file1.txt", error: "Parse error" },
        { file: "file2.txt", error: "Unknown format" }
      ];

      act(() => {
        useCollectionStore.getState().setIndexErrors(errors);
      });

      expect(useCollectionStore.getState().indexErrors).toEqual(errors);
    });

    it("clears indexErrors", () => {
      act(() => {
        useCollectionStore.getState().setIndexErrors([{ file: "file.txt", error: "Error" }]);
        useCollectionStore.getState().setIndexErrors([]);
      });

      expect(useCollectionStore.getState().indexErrors).toEqual([]);
    });
  });

  describe("setSelectedCollections", () => {
    it("sets selectedCollections", () => {
      act(() => {
        useCollectionStore.getState().setSelectedCollections(["collection1", "collection2"]);
      });

      expect(useCollectionStore.getState().selectedCollections).toEqual(["collection1", "collection2"]);
    });

    it("clears selectedCollections", () => {
      act(() => {
        useCollectionStore.getState().setSelectedCollections(["collection1"]);
        useCollectionStore.getState().setSelectedCollections([]);
      });

      expect(useCollectionStore.getState().selectedCollections).toEqual([]);
    });
  });

  describe("fetchCollections", () => {
    it("fetches collections successfully", async () => {
      const mockCollections = { collections: [{ name: "test", count: 5 }] };
      mockClient.GET.mockResolvedValueOnce({ data: mockCollections, error: null });

      await act(async () => {
        await useCollectionStore.getState().fetchCollections();
      });

      expect(mockClient.GET).toHaveBeenCalledWith("/api/collections/");
      expect(useCollectionStore.getState().collections).toEqual(mockCollections);
      expect(useCollectionStore.getState().isLoading).toBe(false);
      expect(useCollectionStore.getState().error).toBeNull();
    });

    it("sets loading state during fetch", async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockClient.GET.mockReturnValueOnce(pendingPromise as any);

      const fetchPromise = useCollectionStore.getState().fetchCollections();

      // isLoading should be true while waiting
      expect(useCollectionStore.getState().isLoading).toBe(true);

      resolvePromise!({ data: { collections: [] }, error: null });
      await fetchPromise;

      expect(useCollectionStore.getState().isLoading).toBe(false);
    });

    it("handles API error with detail message", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: null,
        error: { detail: [{ msg: "API Error" }] }
      });

      await act(async () => {
        await useCollectionStore.getState().fetchCollections();
      });

      expect(useCollectionStore.getState().error).toBe("API Error");
      expect(useCollectionStore.getState().isLoading).toBe(false);
    });

    it("handles API error without detail message", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: null,
        error: {}
      });

      await act(async () => {
        await useCollectionStore.getState().fetchCollections();
      });

      expect(useCollectionStore.getState().error).toBe("Unknown error");
      expect(useCollectionStore.getState().isLoading).toBe(false);
    });

    it("handles exception during fetch", async () => {
      mockClient.GET.mockRejectedValueOnce(new Error("Network error"));

      await act(async () => {
        await useCollectionStore.getState().fetchCollections();
      });

      expect(useCollectionStore.getState().error).toBe("Network error");
      expect(useCollectionStore.getState().isLoading).toBe(false);
    });

    it("handles non-Error exception", async () => {
      mockClient.GET.mockRejectedValueOnce("String error");

      await act(async () => {
        await useCollectionStore.getState().fetchCollections();
      });

      expect(useCollectionStore.getState().error).toBe("Error loading collections");
      expect(useCollectionStore.getState().isLoading).toBe(false);
    });
  });

  describe("deleteCollection", () => {
    it("deletes collection and fetches updated list", async () => {
      mockClient.DELETE.mockResolvedValueOnce({ error: null });
      mockClient.GET.mockResolvedValueOnce({ data: { collections: [] }, error: null });

      await act(async () => {
        await useCollectionStore.getState().deleteCollection("collection1");
      });

      expect(mockClient.DELETE).toHaveBeenCalledWith("/api/collections/{name}", {
        params: { path: { name: "collection1" } }
      });
      expect(mockClient.GET).toHaveBeenCalled();
    });

    it("throws error if delete fails", async () => {
      mockClient.DELETE.mockResolvedValueOnce({ error: { detail: "Delete failed" } });

      await expect(
        useCollectionStore.getState().deleteCollection("collection1")
      ).rejects.toEqual({ detail: "Delete failed" });
    });
  });

  describe("confirmDelete", () => {
    it("deletes the target collection and clears target", async () => {
      useCollectionStore.setState({ deleteTarget: "collection1" });
      mockClient.DELETE.mockResolvedValueOnce({ error: null });
      mockClient.GET.mockResolvedValueOnce({ data: { collections: [] }, error: null });

      await act(async () => {
        await useCollectionStore.getState().confirmDelete();
      });

      expect(mockClient.DELETE).toHaveBeenCalled();
      expect(useCollectionStore.getState().deleteTarget).toBeNull();
    });

    it("does nothing if no delete target", async () => {
      useCollectionStore.setState({ deleteTarget: null });

      await act(async () => {
        await useCollectionStore.getState().confirmDelete();
      });

      expect(mockClient.DELETE).not.toHaveBeenCalled();
    });
  });

  describe("cancelDelete", () => {
    it("clears the delete target", () => {
      useCollectionStore.setState({ deleteTarget: "collection1" });

      act(() => {
        useCollectionStore.getState().cancelDelete();
      });

      expect(useCollectionStore.getState().deleteTarget).toBeNull();
    });
  });

  describe("handleDragOver", () => {
    it("sets dragOverCollection", () => {
      const mockEvent = {
        preventDefault: jest.fn()
      } as unknown as React.DragEvent;

      act(() => {
        useCollectionStore.getState().handleDragOver(mockEvent, "collection1");
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(useCollectionStore.getState().dragOverCollection).toBe("collection1");
    });
  });

  describe("handleDragLeave", () => {
    it("clears dragOverCollection", () => {
      useCollectionStore.setState({ dragOverCollection: "collection1" });
      const mockEvent = {
        preventDefault: jest.fn()
      } as unknown as React.DragEvent;

      act(() => {
        useCollectionStore.getState().handleDragLeave(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(useCollectionStore.getState().dragOverCollection).toBeNull();
    });
  });

  describe("handleDrop", () => {
    it("does nothing if no files dropped", async () => {
      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: {
          files: []
        }
      } as unknown as React.DragEvent<HTMLDivElement>;

      const handler = useCollectionStore.getState().handleDrop("collection1");
      await act(async () => {
        await handler(mockEvent);
      });

      expect(mockClient.POST).not.toHaveBeenCalled();
      expect(useCollectionStore.getState().indexProgress).toBeNull();
    });

    it("processes dropped files and updates progress", async () => {
      const mockFile = new File(["content"], "test.txt", { type: "text/plain" });
      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: {
          files: [mockFile]
        }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockClient.POST.mockResolvedValueOnce({ data: { path: "/test.txt" }, error: null });
      mockClient.GET.mockResolvedValue({ data: { collections: [] }, error: null });

      const handler = useCollectionStore.getState().handleDrop("collection1");
      await act(async () => {
        await handler(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockClient.POST).toHaveBeenCalled();
      expect(useCollectionStore.getState().indexProgress).toBeNull(); // Cleared after completion
      expect(useCollectionStore.getState().indexErrors).toEqual([]);
    });

    it("collects errors from failed file indexing", async () => {
      const mockFile = new File(["content"], "test.txt", { type: "text/plain" });
      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: {
          files: [mockFile]
        }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockClient.POST.mockResolvedValueOnce({
        data: { path: "/test.txt", error: "Parse failed" },
        error: null
      });
      mockClient.GET.mockResolvedValue({ data: { collections: [] }, error: null });

      const handler = useCollectionStore.getState().handleDrop("collection1");
      await act(async () => {
        await handler(mockEvent);
      });

      expect(useCollectionStore.getState().indexErrors).toHaveLength(1);
      expect(useCollectionStore.getState().indexErrors[0].file).toBe("test.txt");
    });

    it("handles API errors during file indexing", async () => {
      const mockFile = new File(["content"], "test.txt", { type: "text/plain" });
      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: {
          files: [mockFile]
        }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockClient.POST.mockResolvedValueOnce({
        data: null,
        error: { detail: [{ msg: "Server error" }] }
      });
      mockClient.GET.mockResolvedValue({ data: { collections: [] }, error: null });

      const handler = useCollectionStore.getState().handleDrop("collection1");
      await act(async () => {
        await handler(mockEvent);
      });

      expect(useCollectionStore.getState().indexErrors).toHaveLength(1);
      expect(useCollectionStore.getState().indexErrors[0].error).toBe("Server error");
    });

    it("handles exceptions during file indexing", async () => {
      const mockFile = new File(["content"], "test.txt", { type: "text/plain" });
      const mockEvent = {
        preventDefault: jest.fn(),
        dataTransfer: {
          files: [mockFile]
        }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockClient.POST.mockRejectedValueOnce(new Error("Network failure"));
      mockClient.GET.mockResolvedValue({ data: { collections: [] }, error: null });

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const handler = useCollectionStore.getState().handleDrop("collection1");
      await act(async () => {
        await handler(mockEvent);
      });

      expect(useCollectionStore.getState().indexErrors).toHaveLength(1);
      expect(useCollectionStore.getState().indexErrors[0].error).toBe("Network failure");

      consoleErrorSpy.mockRestore();
    });
  });
});
