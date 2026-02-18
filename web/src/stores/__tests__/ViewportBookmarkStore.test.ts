import { renderHook, act, cleanup } from "@testing-library/react";
import { useViewportBookmarkStore } from "../ViewportBookmarkStore";

describe("ViewportBookmarkStore", () => {
  // Use unique workflow IDs for each test to avoid interference
  const getTestWorkflowId = (testName: string) => `test-${testName}-${Date.now()}`;

  afterEach(() => {
    cleanup();
  });

  describe("addBookmark", () => {
    it("should add a new bookmark for a workflow", () => {
      const workflowId = getTestWorkflowId("add-single");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Test Bookmark", 100, 200, 1.5);
      });

      const bookmarks = result.current.getBookmarks(workflowId);
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].name).toBe("Test Bookmark");
      expect(bookmarks[0].x).toBe(100);
      expect(bookmarks[0].y).toBe(200);
      expect(bookmarks[0].zoom).toBe(1.5);
      expect(bookmarks[0].workflowId).toBe(workflowId);
    });

    it("should generate unique IDs for bookmarks", () => {
      const workflowId = getTestWorkflowId("unique-ids");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
        result.current.addBookmark(workflowId, "Bookmark 2", 100, 100, 1);
      });

      const bookmarks = result.current.getBookmarks(workflowId);
      expect(bookmarks[0].id).not.toBe(bookmarks[1].id);
    });

    it("should add multiple bookmarks to the same workflow", () => {
      const workflowId = getTestWorkflowId("multiple");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
        result.current.addBookmark(workflowId, "Bookmark 2", 100, 100, 1.5);
        result.current.addBookmark(workflowId, "Bookmark 3", 200, 200, 2);
      });

      const bookmarks = result.current.getBookmarks(workflowId);
      expect(bookmarks).toHaveLength(3);
    });

    it("should store bookmarks separately for different workflows", () => {
      const workflow1Id = getTestWorkflowId("separate-1");
      const workflow2Id = getTestWorkflowId("separate-2");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflow1Id, "Workflow 1 Bookmark", 0, 0, 1);
        result.current.addBookmark(workflow2Id, "Workflow 2 Bookmark", 100, 100, 1.5);
      });

      const workflow1Bookmarks = result.current.getBookmarks(workflow1Id);
      const workflow2Bookmarks = result.current.getBookmarks(workflow2Id);

      expect(workflow1Bookmarks).toHaveLength(1);
      expect(workflow2Bookmarks).toHaveLength(1);
      expect(workflow1Bookmarks[0].workflowId).toBe(workflow1Id);
      expect(workflow2Bookmarks[0].workflowId).toBe(workflow2Id);
    });

    it("should set createdAt timestamp", () => {
      const workflowId = getTestWorkflowId("timestamp");
      const { result } = renderHook(() => useViewportBookmarkStore());

      const beforeCreate = Date.now();

      act(() => {
        result.current.addBookmark(workflowId, "Test", 0, 0, 1);
      });

      const afterCreate = Date.now();
      const bookmarks = result.current.getBookmarks(workflowId);

      expect(bookmarks[0].createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(bookmarks[0].createdAt).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe("updateBookmark", () => {
    it("should update an existing bookmark", () => {
      const workflowId = getTestWorkflowId("update-single");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Original Name", 100, 200, 1.5);
      });

      const bookmarks = result.current.getBookmarks(workflowId);
      const bookmarkId = bookmarks[0].id;

      act(() => {
        result.current.updateBookmark(workflowId, bookmarkId, { name: "Updated Name" });
      });

      const updatedBookmarks = result.current.getBookmarks(workflowId);
      expect(updatedBookmarks[0].name).toBe("Updated Name");
      expect(updatedBookmarks[0].x).toBe(100); // Other fields unchanged
    });

    it("should update multiple fields", () => {
      const workflowId = getTestWorkflowId("update-multiple");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Original", 100, 200, 1.5);
      });

      const bookmarks = result.current.getBookmarks(workflowId);
      const bookmarkId = bookmarks[0].id;

      act(() => {
        result.current.updateBookmark(workflowId, bookmarkId, {
          name: "Updated",
          x: 300,
          y: 400,
          zoom: 2.0
        });
      });

      const updatedBookmarks = result.current.getBookmarks(workflowId);
      expect(updatedBookmarks[0].name).toBe("Updated");
      expect(updatedBookmarks[0].x).toBe(300);
      expect(updatedBookmarks[0].y).toBe(400);
      expect(updatedBookmarks[0].zoom).toBe(2.0);
    });

    it("should not affect other bookmarks when updating one", () => {
      const workflowId = getTestWorkflowId("update-isolated");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
        result.current.addBookmark(workflowId, "Bookmark 2", 100, 100, 1.5);
      });

      const bookmarks = result.current.getBookmarks(workflowId);
      const firstBookmarkId = bookmarks[0].id;

      act(() => {
        result.current.updateBookmark(workflowId, firstBookmarkId, { name: "Updated" });
      });

      const updatedBookmarks = result.current.getBookmarks(workflowId);
      expect(updatedBookmarks[0].name).toBe("Updated");
      expect(updatedBookmarks[1].name).toBe("Bookmark 2");
    });
  });

  describe("deleteBookmark", () => {
    it("should delete a bookmark by ID", () => {
      const workflowId = getTestWorkflowId("delete");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
        result.current.addBookmark(workflowId, "Bookmark 2", 100, 100, 1.5);
      });

      const bookmarks = result.current.getBookmarks(workflowId);
      const bookmarkId = bookmarks[0].id;

      act(() => {
        result.current.deleteBookmark(workflowId, bookmarkId);
      });

      const remainingBookmarks = result.current.getBookmarks(workflowId);
      expect(remainingBookmarks).toHaveLength(1);
      expect(remainingBookmarks[0].name).toBe("Bookmark 2");
    });

    it("should handle deleting non-existent bookmark", () => {
      const workflowId = getTestWorkflowId("delete-nonexistent");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
      });

      const initialCount = result.current.getBookmarks(workflowId).length;

      act(() => {
        result.current.deleteBookmark(workflowId, "non-existent-id");
      });

      const finalCount = result.current.getBookmarks(workflowId).length;
      expect(finalCount).toBe(initialCount);
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("should clear all bookmarks for a workflow", () => {
      const workflow1Id = getTestWorkflowId("clear-1");
      const workflow2Id = getTestWorkflowId("clear-2");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflow1Id, "Bookmark 1", 0, 0, 1);
        result.current.addBookmark(workflow1Id, "Bookmark 2", 100, 100, 1.5);
        result.current.addBookmark(workflow2Id, "Other Workflow", 0, 0, 1);
      });

      act(() => {
        result.current.clearWorkflowBookmarks(workflow1Id);
      });

      const workflow1Bookmarks = result.current.getBookmarks(workflow1Id);
      const workflow2Bookmarks = result.current.getBookmarks(workflow2Id);

      expect(workflow1Bookmarks).toHaveLength(0);
      expect(workflow2Bookmarks).toHaveLength(1);
    });
  });

  describe("getBookmarks", () => {
    it("should return empty array for workflow with no bookmarks", () => {
      const workflowId = getTestWorkflowId("empty");
      const { result } = renderHook(() => useViewportBookmarkStore());

      const bookmarks = result.current.getBookmarks(workflowId);
      expect(bookmarks).toEqual([]);
    });

    it("should return all bookmarks for a workflow", () => {
      const workflowId = getTestWorkflowId("get-all");
      const { result } = renderHook(() => useViewportBookmarkStore());

      act(() => {
        result.current.addBookmark(workflowId, "Bookmark 1", 0, 0, 1);
        result.current.addBookmark(workflowId, "Bookmark 2", 100, 100, 1.5);
        result.current.addBookmark(getTestWorkflowId("other"), "Other", 0, 0, 1);
      });

      const workflow1Bookmarks = result.current.getBookmarks(workflowId);
      expect(workflow1Bookmarks).toHaveLength(2);
    });
  });
});
