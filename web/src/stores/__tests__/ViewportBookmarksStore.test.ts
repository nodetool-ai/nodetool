import { renderHook, act } from "@testing-library/react";
import useViewportBookmarksStore from "../ViewportBookmarksStore";

describe("ViewportBookmarksStore", () => {
  const workflowId = "test-workflow-1";
  const otherWorkflowId = "test-workflow-2";

  beforeEach(() => {
    // Clear all bookmarks before each test
    const { result } = renderHook(() => useViewportBookmarksStore());
    act(() => {
      result.current.deleteWorkflowBookmarks(workflowId);
      result.current.deleteWorkflowBookmarks(otherWorkflowId);
    });
  });

  afterEach(() => {
    // Cleanup after each test
    const { result } = renderHook(() => useViewportBookmarksStore());
    act(() => {
      result.current.deleteWorkflowBookmarks(workflowId);
      result.current.deleteWorkflowBookmarks(otherWorkflowId);
    });
  });

  describe("getBookmarks", () => {
    it("should return empty array for workflow with no bookmarks", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      const bookmarks = result.current.getBookmarks(workflowId);

      expect(bookmarks).toEqual([]);
    });

    it("should return all bookmarks for a workflow", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 100, 200, 1);
        result.current.addBookmark(workflowId, "Bookmark 2", 300, 400, 1.5);
      });

      const bookmarks = result.current.getBookmarks(workflowId);

      expect(bookmarks).toHaveLength(2);
      expect(bookmarks[0].name).toBe("Bookmark 1");
      expect(bookmarks[1].name).toBe("Bookmark 2");
    });

    it("should not return bookmarks from other workflows", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(otherWorkflowId, "Other Bookmark", 0, 0, 1);
        result.current.addBookmark(workflowId, "My Bookmark", 100, 200, 1);
      });

      const bookmarks = result.current.getBookmarks(workflowId);

      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].name).toBe("My Bookmark");
    });
  });

  describe("addBookmark", () => {
    it("should create a new bookmark with provided values", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        const addedBookmark = result.current.addBookmark(
          workflowId,
          "Test Bookmark",
          150,
          250,
          1.2
        );

        expect(addedBookmark).toBeDefined();
        expect(addedBookmark.name).toBe("Test Bookmark");
        expect(addedBookmark.x).toBe(150);
        expect(addedBookmark.y).toBe(250);
        expect(addedBookmark.zoom).toBe(1.2);
        expect(addedBookmark.id).toBeDefined();
        expect(addedBookmark.createdAt).toBeDefined();
      });
    });

    it("should add bookmark to the workflow's bookmark list", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(workflowId, "New Bookmark", 0, 0, 1);
      });

      const bookmarks = result.current.getBookmarks(workflowId);

      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].name).toBe("New Bookmark");
    });

    it("should generate unique IDs for different bookmarks", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      let bookmark1Id: string | undefined;
      let bookmark2Id: string | undefined;

      act(() => {
        const bookmark1 = result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
        bookmark1Id = bookmark1.id;
      });

      act(() => {
        const bookmark2 = result.current.addBookmark(workflowId, "Bookmark 2", 0, 0, 1);
        bookmark2Id = bookmark2.id;
      });

      expect(bookmark1Id).toBeDefined();
      expect(bookmark2Id).toBeDefined();
      expect(bookmark1Id).not.toBe(bookmark2Id);
    });

    it("should throw error when adding duplicate name", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(workflowId, "Duplicate Name", 0, 0, 1);
      });

      expect(() => {
        act(() => {
          result.current.addBookmark(workflowId, "Duplicate Name", 100, 100, 1);
        });
      }).toThrow('Bookmark "Duplicate Name" already exists');
    });
  });

  describe("updateBookmark", () => {
    it("should update bookmark name", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        const bookmark = result.current.addBookmark(workflowId, "Old Name", 0, 0, 1);
        result.current.updateBookmark(workflowId, bookmark.id, "New Name");

        const bookmarks = result.current.getBookmarks(workflowId);

        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].name).toBe("New Name");
        expect(bookmarks[0].id).toBe(bookmark.id);
      });
    });

    it("should throw error when updating to duplicate name", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      let bookmark2Id: string | undefined;

      act(() => {
        result.current.addBookmark(workflowId, "Name 1", 0, 0, 1);
      });

      act(() => {
        const bookmark2 = result.current.addBookmark(workflowId, "Name 2", 100, 100, 1);
        bookmark2Id = bookmark2.id;
      });

      expect(() => {
        act(() => {
          result.current.updateBookmark(workflowId, bookmark2Id!, "Name 1");
        });
      }).toThrow('Bookmark "Name 1" already exists');
    });

    it("should allow updating bookmark to same name", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        const bookmark = result.current.addBookmark(workflowId, "Same Name", 0, 0, 1);
        result.current.updateBookmark(workflowId, bookmark.id, "Same Name");

        const bookmarks = result.current.getBookmarks(workflowId);

        expect(bookmarks[0].name).toBe("Same Name");
      });
    });
  });

  describe("deleteBookmark", () => {
    it("should remove bookmark from workflow", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(workflowId, "Keep", 0, 0, 1);
        const bookmark = result.current.addBookmark(workflowId, "Delete", 100, 100, 1);
        result.current.deleteBookmark(workflowId, bookmark.id);

        const bookmarks = result.current.getBookmarks(workflowId);

        expect(bookmarks).toHaveLength(1);
        expect(bookmarks[0].name).toBe("Keep");
      });
    });

    it("should not affect other workflows when deleting", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        const bookmark = result.current.addBookmark(otherWorkflowId, "Other Bookmark", 0, 0, 1);
        result.current.deleteBookmark(workflowId, bookmark.id);

        const otherBookmarks = result.current.getBookmarks(otherWorkflowId);

        expect(otherBookmarks).toHaveLength(1);
      });
    });
  });

  describe("deleteWorkflowBookmarks", () => {
    it("should remove all bookmarks for a workflow", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
        result.current.addBookmark(workflowId, "Bookmark 2", 100, 100, 1);
        result.current.addBookmark(workflowId, "Bookmark 3", 200, 200, 1);
        result.current.deleteWorkflowBookmarks(workflowId);

        const bookmarks = result.current.getBookmarks(workflowId);

        expect(bookmarks).toEqual([]);
      });
    });
  });

  describe("bookmarkNameExists", () => {
    it("should return true when name exists", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(workflowId, "Existing Name", 0, 0, 1);
      });

      const exists = result.current.bookmarkNameExists(workflowId, "Existing Name");

      expect(exists).toBe(true);
    });

    it("should return false when name does not exist", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      const exists = result.current.bookmarkNameExists(workflowId, "Non Existing");

      expect(exists).toBe(false);
    });

    it("should not find names in other workflows", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(otherWorkflowId, "Other Workflow Name", 0, 0, 1);
      });

      const exists = result.current.bookmarkNameExists(workflowId, "Other Workflow Name");

      expect(exists).toBe(false);
    });

    it("should be case sensitive", () => {
      const { result } = renderHook(() => useViewportBookmarksStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark Name", 0, 0, 1);
      });

      expect(result.current.bookmarkNameExists(workflowId, "Bookmark Name")).toBe(true);
      expect(result.current.bookmarkNameExists(workflowId, "bookmark name")).toBe(false);
      expect(result.current.bookmarkNameExists(workflowId, "BOOKMARK NAME")).toBe(false);
    });
  });
});
