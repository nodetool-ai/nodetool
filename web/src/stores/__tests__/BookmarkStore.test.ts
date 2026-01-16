import { renderHook, act, waitFor } from "@testing-library/react";
import { useBookmarkStore } from "../BookmarkStore";

describe("BookmarkStore", () => {
  beforeEach(() => {
    useBookmarkStore.setState({ bookmarks: [], currentBookmarkId: null });
  });

  afterEach(() => {
    useBookmarkStore.setState({ bookmarks: [], currentBookmarkId: null });
  });

  describe("addBookmark", () => {
    it("should add a bookmark with the given name and viewport", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      act(() => {
        result.current.addBookmark("Test Bookmark", { x: 100, y: 200, zoom: 1.5 });
      });

      await waitFor(() => {
        const bookmarks = result.current.getAllBookmarks();
        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].name).toBe("Test Bookmark");
        expect(bookmarks[0].viewport).toEqual({ x: 100, y: 200, zoom: 1.5 });
        expect(bookmarks[0].id).toBeDefined();
        expect(bookmarks[0].createdAt).toBeDefined();
      });
    });

    it("should set currentBookmarkId to the newly added bookmark", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      let addedId: string | undefined;
      act(() => {
        addedId = result.current.addBookmark("First", { x: 0, y: 0, zoom: 1 });
      });

      await waitFor(() => {
        expect(result.current.currentBookmarkId).toBe(addedId);
      });
    });

    it("should assign colors cyclically", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      act(() => {
        result.current.addBookmark("Bookmark 1", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 2", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 3", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 4", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 5", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 6", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 7", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 8", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Bookmark 9", { x: 0, y: 0, zoom: 1 });
      });

      await waitFor(() => {
        const bookmarks = result.current.getAllBookmarks();
        expect(bookmarks.length).toBe(9);
        expect(bookmarks[0].color).toBe(bookmarks[8].color);
      });
    });

    it("should respect custom color when provided", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      act(() => {
        result.current.addBookmark("Custom", { x: 0, y: 0, zoom: 1 }, "#ff0000");
      });

      await waitFor(() => {
        const bookmarks = result.current.getAllBookmarks();
        expect(bookmarks[0].color).toBe("#ff0000");
      });
    });
  });

  describe("removeBookmark", () => {
    it("should remove a bookmark by id", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      let bookmarkId: string;
      act(() => {
        bookmarkId = result.current.addBookmark("To Remove", { x: 0, y: 0, zoom: 1 });
      });

      await waitFor(() => {
        expect(result.current.getAllBookmarks()).toHaveLength(1);
      });

      act(() => {
        result.current.removeBookmark(bookmarkId);
      });

      await waitFor(() => {
        expect(result.current.getAllBookmarks()).toHaveLength(0);
      });
    });

    it("should clear currentBookmarkId when the current bookmark is removed", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      let bookmarkId: string;
      act(() => {
        bookmarkId = result.current.addBookmark("Test", { x: 0, y: 0, zoom: 1 });
      });

      await waitFor(() => {
        expect(result.current.currentBookmarkId).toBe(bookmarkId);
      });

      act(() => {
        result.current.removeBookmark(bookmarkId);
      });

      await waitFor(() => {
        expect(result.current.currentBookmarkId).toBeNull();
      });
    });
  });

  describe("updateBookmark", () => {
    it("should update bookmark name", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      let bookmarkId: string;
      act(() => {
        bookmarkId = result.current.addBookmark("Original", { x: 0, y: 0, zoom: 1 });
        result.current.updateBookmark(bookmarkId, { name: "Updated" });
      });

      await waitFor(() => {
        const bookmark = result.current.getBookmark(bookmarkId);
        expect(bookmark?.name).toBe("Updated");
      });
    });

    it("should update bookmark viewport", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      let bookmarkId: string;
      act(() => {
        bookmarkId = result.current.addBookmark("Test", { x: 0, y: 0, zoom: 1 });
        result.current.updateBookmark(bookmarkId, { viewport: { x: 500, y: 500, zoom: 2 } });
      });

      await waitFor(() => {
        const bookmark = result.current.getBookmark(bookmarkId);
        expect(bookmark?.viewport).toEqual({ x: 500, y: 500, zoom: 2 });
      });
    });
  });

  describe("navigation", () => {
    beforeEach(async () => {
      useBookmarkStore.setState({
        bookmarks: [
          {
            id: "1",
            name: "Bookmark 1",
            viewport: { x: 0, y: 0, zoom: 1 },
            createdAt: 1000
          },
          {
            id: "2",
            name: "Bookmark 2",
            viewport: { x: 100, y: 100, zoom: 1.5 },
            createdAt: 2000
          },
          {
            id: "3",
            name: "Bookmark 3",
            viewport: { x: 200, y: 200, zoom: 2 },
            createdAt: 3000
          }
        ],
        currentBookmarkId: null
      });
    });

    describe("getNextBookmark", () => {
      it("should return the next bookmark when currentId is provided", () => {
        const { result } = renderHook(() => useBookmarkStore());

        const next = result.current.getNextBookmark("1");
        expect(next?.id).toBe("2");
      });

      it("should return first bookmark when at the end", () => {
        const { result } = renderHook(() => useBookmarkStore());

        const next = result.current.getNextBookmark("3");
        expect(next?.id).toBe("1");
      });

      it("should return first bookmark when currentId not found", () => {
        const { result } = renderHook(() => useBookmarkStore());

        const next = result.current.getNextBookmark("nonexistent");
        expect(next?.id).toBe("1");
      });
    });

    describe("getPrevBookmark", () => {
      it("should return the previous bookmark when currentId is provided", () => {
        const { result } = renderHook(() => useBookmarkStore());

        const prev = result.current.getPrevBookmark("3");
        expect(prev?.id).toBe("2");
      });

      it("should return last bookmark when at the beginning", () => {
        const { result } = renderHook(() => useBookmarkStore());

        const prev = result.current.getPrevBookmark("1");
        expect(prev?.id).toBe("3");
      });
    });

    describe("navigateToBookmark", () => {
      it("should navigate to next bookmark and update currentBookmarkId", async () => {
        const { result } = renderHook(() => useBookmarkStore());

        let bookmark: ReturnType<typeof result.current.navigateToBookmark>;
        act(() => {
          bookmark = result.current.navigateToBookmark("next");
        });

        await waitFor(() => {
          expect(bookmark).toBeDefined();
          expect(bookmark?.id).toBe("1");
          expect(result.current.currentBookmarkId).toBe("1");
        });
      });

      it("should navigate to prev bookmark when direction is prev", async () => {
        const { result } = renderHook(() => useBookmarkStore());

        let bookmark: ReturnType<typeof result.current.navigateToBookmark>;
        act(() => {
          bookmark = result.current.navigateToBookmark("prev");
        });

        await waitFor(() => {
          expect(bookmark).toBeDefined();
          expect(bookmark?.id).toBe("3");
          expect(result.current.currentBookmarkId).toBe("3");
        });
      });

      it("should return null when there are no bookmarks", () => {
        useBookmarkStore.setState({ bookmarks: [], currentBookmarkId: null });
        const { result } = renderHook(() => useBookmarkStore());

        const bookmark = result.current.navigateToBookmark("next");
        expect(bookmark).toBeNull();
      });
    });
  });

  describe("clearBookmarks", () => {
    it("should remove all bookmarks and clear currentBookmarkId", async () => {
      const { result } = renderHook(() => useBookmarkStore());

      act(() => {
        result.current.addBookmark("Test 1", { x: 0, y: 0, zoom: 1 });
        result.current.addBookmark("Test 2", { x: 0, y: 0, zoom: 1 });
        result.current.clearBookmarks();
      });

      await waitFor(() => {
        expect(result.current.getAllBookmarks()).toHaveLength(0);
        expect(result.current.currentBookmarkId).toBeNull();
      });
    });
  });
});
