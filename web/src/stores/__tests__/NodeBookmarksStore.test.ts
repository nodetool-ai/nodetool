/**
 * Tests for NodeBookmarksStore
 */

import { renderHook, act } from "@testing-library/react";
import { useNodeBookmarksStore } from "../NodeBookmarksStore";

describe("NodeBookmarksStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    useNodeBookmarksStore.getState().bookmarks = {};
  });

  describe("addBookmark", () => {
    it("should add a bookmark to a workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
      });

      expect(result.current.isBookmarked("workflow-1", "node-1")).toBe(true);
      expect(result.current.getWorkflowBookmarks("workflow-1")).toHaveLength(1);
      expect(result.current.getWorkflowBookmarks("workflow-1")[0]).toMatchObject({
        nodeId: "node-1",
        workflowId: "workflow-1",
        name: "My Bookmark"
      });
    });

    it("should not add duplicate bookmarks", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 2");
      });

      expect(result.current.getWorkflowBookmarks("workflow-1")).toHaveLength(1);
      expect(result.current.getWorkflowBookmarks("workflow-1")[0].name).toBe("Bookmark 1");
    });

    it("should add bookmarks to different workflows independently", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Workflow 1 Bookmark");
        result.current.addBookmark("workflow-2", "node-2", "Workflow 2 Bookmark");
      });

      expect(result.current.getWorkflowBookmarks("workflow-1")).toHaveLength(1);
      expect(result.current.getWorkflowBookmarks("workflow-2")).toHaveLength(1);
      expect(result.current.getWorkflowBookmarks("workflow-1")[0].nodeId).toBe("node-1");
      expect(result.current.getWorkflowBookmarks("workflow-2")[0].nodeId).toBe("node-2");
    });
  });

  describe("removeBookmark", () => {
    it("should remove a bookmark from a workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
        result.current.removeBookmark("workflow-1", "node-1");
      });

      expect(result.current.isBookmarked("workflow-1", "node-1")).toBe(false);
      expect(result.current.getWorkflowBookmarks("workflow-1")).toHaveLength(0);
    });

    it("should only remove the specified bookmark", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 2");
        result.current.removeBookmark("workflow-1", "node-1");
      });

      expect(result.current.isBookmarked("workflow-1", "node-1")).toBe(false);
      expect(result.current.isBookmarked("workflow-1", "node-2")).toBe(true);
      expect(result.current.getWorkflowBookmarks("workflow-1")).toHaveLength(1);
    });
  });

  describe("isBookmarked", () => {
    it("should return true for bookmarked nodes", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
      });

      expect(result.current.isBookmarked("workflow-1", "node-1")).toBe(true);
    });

    it("should return false for non-bookmarked nodes", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      expect(result.current.isBookmarked("workflow-1", "node-1")).toBe(false);
    });

    it("should return false for nodes in different workflows", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "My Bookmark");
      });

      expect(result.current.isBookmarked("workflow-2", "node-1")).toBe(false);
    });
  });

  describe("getWorkflowBookmarks", () => {
    it("should return all bookmarks for a workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 2");
        result.current.addBookmark("workflow-1", "node-3", "Bookmark 3");
      });

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(3);
      expect(bookmarks.map((b) => b.nodeId)).toEqual(["node-1", "node-2", "node-3"]);
    });

    it("should return empty array for workflow with no bookmarks", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks).toEqual([]);
    });

    it("should preserve bookmark creation order", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-3", "Third");
        result.current.addBookmark("workflow-1", "node-1", "First");
        result.current.addBookmark("workflow-1", "node-2", "Second");
      });

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks.map((b) => b.nodeId)).toEqual(["node-3", "node-1", "node-2"]);
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("should clear all bookmarks for a workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 2");
        result.current.addBookmark("workflow-2", "node-3", "Bookmark 3");
        result.current.clearWorkflowBookmarks("workflow-1");
      });

      expect(result.current.getWorkflowBookmarks("workflow-1")).toEqual([]);
      expect(result.current.getWorkflowBookmarks("workflow-2")).toHaveLength(1);
    });
  });

  describe("renameBookmark", () => {
    it("should rename an existing bookmark", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Original Name");
        result.current.renameBookmark("workflow-1", "node-1", "New Name");
      });

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks[0].name).toBe("New Name");
    });

    it("should not affect other bookmarks when renaming", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("workflow-1", "node-1", "Bookmark 1");
        result.current.addBookmark("workflow-1", "node-2", "Bookmark 2");
        result.current.renameBookmark("workflow-1", "node-1", "Renamed");
      });

      const bookmarks = result.current.getWorkflowBookmarks("workflow-1");
      expect(bookmarks[0].name).toBe("Renamed");
      expect(bookmarks[1].name).toBe("Bookmark 2");
    });
  });
});
