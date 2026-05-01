import { act } from "@testing-library/react";
import { restFetch } from "../../lib/rest-fetch";
import { trpcClient } from "../../trpc/client";
import { useCollectionStore } from "../CollectionStore";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    collections: {
      list: { query: jest.fn() },
      delete: { mutate: jest.fn() }
    }
  }
}));

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));


const listQuery = trpcClient.collections.list.query as jest.Mock;
const deleteMutate = trpcClient.collections.delete.mutate as jest.Mock;
const mockRestFetch = restFetch as jest.Mock;

describe("CollectionStore", () => {
  beforeEach(() => {
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
      expect(useCollectionStore.getState().collections).toBeNull();
    });

    it("is not loading initially", () => {
      expect(useCollectionStore.getState().isLoading).toBe(false);
    });

    it("has no error initially", () => {
      expect(useCollectionStore.getState().error).toBeNull();
    });

    it("has no delete target initially", () => {
      expect(useCollectionStore.getState().deleteTarget).toBeNull();
    });

    it("has showForm set to false initially", () => {
      expect(useCollectionStore.getState().showForm).toBe(false);
    });

    it("has no dragOverCollection initially", () => {
      expect(useCollectionStore.getState().dragOverCollection).toBeNull();
    });

    it("has no indexProgress initially", () => {
      expect(useCollectionStore.getState().indexProgress).toBeNull();
    });

    it("has empty indexErrors initially", () => {
      expect(useCollectionStore.getState().indexErrors).toEqual([]);
    });

    it("has empty selectedCollections initially", () => {
      expect(useCollectionStore.getState().selectedCollections).toEqual([]);
    });
  });

  describe("setters", () => {
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

    it("sets isLoading", () => {
      act(() => {
        useCollectionStore.getState().setIsLoading(true);
      });
      expect(useCollectionStore.getState().isLoading).toBe(true);
    });

    it("sets and clears error", () => {
      act(() => {
        useCollectionStore.getState().setError("Test error");
        useCollectionStore.getState().setError(null);
      });
      expect(useCollectionStore.getState().error).toBeNull();
    });

    it("sets and clears delete target", () => {
      act(() => {
        useCollectionStore.getState().setDeleteTarget("collection1");
        useCollectionStore.getState().setDeleteTarget(null);
      });
      expect(useCollectionStore.getState().deleteTarget).toBeNull();
    });

    it("sets and clears showForm", () => {
      act(() => {
        useCollectionStore.getState().setShowForm(true);
        useCollectionStore.getState().setShowForm(false);
      });
      expect(useCollectionStore.getState().showForm).toBe(false);
    });

    it("sets and clears dragOverCollection", () => {
      act(() => {
        useCollectionStore.getState().setDragOverCollection("collection1");
        useCollectionStore.getState().setDragOverCollection(null);
      });
      expect(useCollectionStore.getState().dragOverCollection).toBeNull();
    });

    it("sets and clears indexProgress", () => {
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

    it("sets index errors", () => {
      const errors = [{ file: "bad.txt", error: "oops" }];
      act(() => {
        useCollectionStore.getState().setIndexErrors(errors);
      });
      expect(useCollectionStore.getState().indexErrors).toEqual(errors);
    });

    it("sets selected collections", () => {
      act(() => {
        useCollectionStore.getState().setSelectedCollections(["a", "b"]);
      });
      expect(useCollectionStore.getState().selectedCollections).toEqual(["a", "b"]);
    });
  });

  describe("fetchCollections", () => {
    it("loads collections via tRPC", async () => {
      const collections = {
        collections: [{ name: "test", count: 5, metadata: {} }],
        count: 1
      };
      listQuery.mockResolvedValueOnce(collections);

      await act(async () => {
        await useCollectionStore.getState().fetchCollections();
      });

      expect(listQuery).toHaveBeenCalled();
      expect(useCollectionStore.getState().collections).toEqual(collections);
      expect(useCollectionStore.getState().isLoading).toBe(false);
    });

    it("handles fetch error", async () => {
      listQuery.mockRejectedValueOnce(new Error("boom"));

      await act(async () => {
        await useCollectionStore.getState().fetchCollections();
      });

      expect(useCollectionStore.getState().error).toBe("boom");
      expect(useCollectionStore.getState().isLoading).toBe(false);
    });
  });

  describe("deleteCollection", () => {
    it("deletes and reloads", async () => {
      deleteMutate.mockResolvedValueOnce(undefined);
      listQuery.mockResolvedValueOnce({ collections: [], count: 0 });

      await act(async () => {
        await useCollectionStore.getState().deleteCollection("test");
      });

      expect(deleteMutate).toHaveBeenCalledWith({ name: "test" });
      expect(listQuery).toHaveBeenCalled();
    });

    it("confirmDelete deletes current target", async () => {
      useCollectionStore.setState({ deleteTarget: "test" });
      deleteMutate.mockResolvedValueOnce(undefined);
      listQuery.mockResolvedValueOnce({ collections: [], count: 0 });

      await act(async () => {
        await useCollectionStore.getState().confirmDelete();
      });

      expect(deleteMutate).toHaveBeenCalledWith({ name: "test" });
      expect(useCollectionStore.getState().deleteTarget).toBeNull();
    });

    it("cancelDelete clears target", () => {
      useCollectionStore.setState({ deleteTarget: "test" });
      act(() => {
        useCollectionStore.getState().cancelDelete();
      });
      expect(useCollectionStore.getState().deleteTarget).toBeNull();
    });
  });

  describe("drag and drop", () => {
    it("sets dragOverCollection on drag over", () => {
      const event = { preventDefault: jest.fn() } as unknown as React.DragEvent;
      act(() => {
        useCollectionStore.getState().handleDragOver(event, "collection1");
      });
      expect(event.preventDefault).toHaveBeenCalled();
      expect(useCollectionStore.getState().dragOverCollection).toBe("collection1");
    });

    it("clears dragOverCollection on drag leave", () => {
      useCollectionStore.setState({ dragOverCollection: "collection1" });
      const event = { preventDefault: jest.fn() } as unknown as React.DragEvent;
      act(() => {
        useCollectionStore.getState().handleDragLeave(event);
      });
      expect(event.preventDefault).toHaveBeenCalled();
      expect(useCollectionStore.getState().dragOverCollection).toBeNull();
    });

    it("uploads dropped files via restFetch and refreshes once", async () => {
      const files = [
        new File(["a"], "a.txt", { type: "text/plain" }),
        new File(["b"], "b.txt", { type: "text/plain" })
      ];
      const event = {
        preventDefault: jest.fn(),
        dataTransfer: { files }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockRestFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ path: "/ok" })
      });
      listQuery.mockResolvedValueOnce({ collections: [], count: 0 });

      await act(async () => {
        await useCollectionStore.getState().handleDrop("collection1")(event);
      });

      expect(mockRestFetch).toHaveBeenCalledTimes(2);
      expect(listQuery).toHaveBeenCalledTimes(1);
      expect(useCollectionStore.getState().indexErrors).toEqual([]);
      expect(useCollectionStore.getState().indexProgress).toBeNull();
    });

    it("collects per-file API errors", async () => {
      const file = new File(["a"], "bad.txt", { type: "text/plain" });
      const event = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [file] }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockRestFetch.mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({
          detail: [{ msg: "Upload failed" }],
          error: "Upload failed"
        })
      });
      listQuery.mockResolvedValueOnce({ collections: [], count: 0 });

      await act(async () => {
        await useCollectionStore.getState().handleDrop("collection1")(event);
      });

      expect(useCollectionStore.getState().indexErrors).toEqual([
        { file: "bad.txt", error: "Upload failed" }
      ]);
    });

    it("logs thrown upload exceptions", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const file = new File(["a"], "bad.txt", { type: "text/plain" });
      const event = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [file] }
      } as unknown as React.DragEvent<HTMLDivElement>;

      mockRestFetch.mockRejectedValueOnce(new Error("network"));
      listQuery.mockResolvedValueOnce({ collections: [], count: 0 });

      await act(async () => {
        await useCollectionStore.getState().handleDrop("collection1")(event);
      });

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      expect(useCollectionStore.getState().indexErrors).toEqual([
        { file: "bad.txt", error: "network" }
      ]);
    });

    it("returns early when no files dropped", async () => {
      const event = {
        preventDefault: jest.fn(),
        dataTransfer: { files: [] }
      } as unknown as React.DragEvent<HTMLDivElement>;

      await act(async () => {
        await useCollectionStore.getState().handleDrop("collection1")(event);
      });

      expect(mockRestFetch).not.toHaveBeenCalled();
      expect(listQuery).not.toHaveBeenCalled();
    });
  });
});
