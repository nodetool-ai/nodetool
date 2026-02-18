/**
 * Tests for WorkflowBookmarksStore
 */

import { renderHook, act } from "@testing-library/react";
import { useWorkflowBookmarksStore } from "../WorkflowBookmarksStore";

describe("WorkflowBookmarksStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowBookmarksStore.setState({ bookmarks: {} });
  });

  describe("addBookmark", () => {
    it("should add a bookmark to a workflow", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
      });

      expect(result.current.bookmarks["workflow-1"]).toHaveLength(1);
      expect(result.current.bookmarks["workflow-1"][0]).toEqual({
        nodeId: "node-1",
        label: "My Bookmark",
        index: 0,
        createdAt: expect.any(Number)
      });
    });

    it("should assign sequential indices to bookmarks", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 0");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-3", "Bookmark 2");
      });

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks[0].index).toBe(0);
      expect(bookmarks[1].index).toBe(1);
      expect(bookmarks[2].index).toBe(2);
    });

    it("should reuse indices when bookmarks are removed", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 0");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 1");
        result.current.removeBookmark("workflow-1", "node-1");
        result.current.addBookmark("workflow-1", "node-3", "Bookmark 3");
      });

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(2);
      // After sorting by index, bookmark 1 (index 1) comes first, then the new bookmark (index 0)
      expect(bookmarks[0].index).toBe(0);
      expect(bookmarks[1].index).toBe(1);
    });

    it("should not add more than 10 bookmarks per workflow", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        for (let i = 0; i < 11; i++) {
          result.current.addBookmark(`workflow-1`, `node-${i}`, `Bookmark ${i}`);
        }
      });

      expect(result.current.bookmarks["workflow-1"]).toHaveLength(10);
    });

    it("should update label if node is already bookmarked", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Original Label");
        result.current.addBookmark("workflow-1", "node-1", "Updated Label");
      });

      const bookmark = result.current.getBookmark("workflow-1", "node-1");
      expect(bookmark?.label).toBe("Updated Label");
      expect(result.current.bookmarks["workflow-1"]).toHaveLength(1);
    });

    it("should use default label if none provided", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1");
      });

      const bookmark = result.current.getBookmark("workflow-1", "node-1");
      expect(bookmark?.label).toBe("Bookmark 0");
    });
  });

  describe("removeBookmark", () => {
    it("should remove a bookmark from a workflow", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
        result.current.removeBookmark("workflow-1", "node-1");
      });

      expect(result.current.bookmarks["workflow-1"]).toHaveLength(0);
    });

    it("should only remove the specified bookmark", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 2");
        result.current.removeBookmark("workflow-1", "node-1");
      });

      expect(result.current.bookmarks["workflow-1"]).toHaveLength(1);
      expect(result.current.bookmarks["workflow-1"][0].nodeId).toBe("node-2");
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("should remove all bookmarks for a workflow", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 2");
        result.current.clearWorkflowBookmarks("workflow-1");
      });

      expect(result.current.bookmarks["workflow-1"]).toBeUndefined();
    });

    it("should not affect other workflows", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-2", "node-2", "Bookmark 2");
        result.current.clearWorkflowBookmarks("workflow-1");
      });

      expect(result.current.bookmarks["workflow-1"]).toBeUndefined();
      expect(result.current.bookmarks["workflow-2"]).toHaveLength(1);
    });
  });

  describe("setBookmarkLabel", () => {
    it("should update the label of a bookmark", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Original Label");
        result.current.setBookmarkLabel("workflow-1", "node-1", "New Label");
      });

      const bookmark = result.current.getBookmark("workflow-1", "node-1");
      expect(bookmark?.label).toBe("New Label");
    });
  });

  describe("getWorkflowBookmarks", () => {
    it("should return bookmarks sorted by index", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 2");
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-3", "Bookmark 3");
      });

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks[0].index).toBeLessThanOrEqual(bookmarks[1].index);
      expect(bookmarks[1].index).toBeLessThanOrEqual(bookmarks[2].index);
    });

    it("should return empty array for non-existent workflow", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      const bookmarks = result.current.getWorkflowBookmarks("non-existent");
      expect(bookmarks).toEqual([]);
    });
  });

  describe("getBookmark", () => {
    it("should return the bookmark for a specific node", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
      });

      const bookmark = result.current.getBookmark("workflow-1", "node-1");
      expect(bookmark).toEqual({
        nodeId: "node-1",
        label: "My Bookmark",
        index: 0,
        createdAt: expect.any(Number)
      });
    });

    it("should return undefined for non-existent bookmark", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      const bookmark = result.current.getBookmark("workflow-1", "node-1");
      expect(bookmark).toBeUndefined();
    });
  });

  describe("getNumberedBookmark", () => {
    it("should return bookmark by index", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 0");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 1");
      });

      const bookmark = result.current.getNumberedBookmark("workflow-1", 1);
      expect(bookmark?.nodeId).toBe("node-2");
    });

    it("should return undefined for non-existent index", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      const bookmark = result.current.getNumberedBookmark("workflow-1", 5);
      expect(bookmark).toBeUndefined();
    });
  });

  describe("isNodeBookmarked", () => {
    it("should return true for bookmarked node", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
      });

      expect(result.current.isNodeBookmarked("workflow-1", "node-1")).toBe(true);
    });

    it("should return false for non-bookmarked node", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      expect(result.current.isNodeBookmarked("workflow-1", "node-1")).toBe(false);
    });

    it("should return false for non-existent workflow", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      expect(result.current.isNodeBookmarked("non-existent", "node-1")).toBe(false);
    });
  });

  describe("multiple workflows", () => {
    it("should maintain separate bookmarks for different workflows", () => {
      const { result } = renderHook(() => useWorkflowBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "WF1 Bookmark");
        result.current.addBookmark("workflow-2", "node-2", "WF2 Bookmark");
      });

      expect(result.current.bookmarks["workflow-1"]).toHaveLength(1);
      expect(result.current.bookmarks["workflow-2"]).toHaveLength(1);
      expect(result.current.bookmarks["workflow-1"][0].nodeId).toBe("node-1");
      expect(result.current.bookmarks["workflow-2"][0].nodeId).toBe("node-2");
    });
  });
});
