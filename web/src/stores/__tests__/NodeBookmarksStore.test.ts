/**
 * NodeBookmarksStore tests
 */

import { renderHook, act } from "@testing-library/react";
import { useNodeBookmarksStore } from "../NodeBookmarksStore";

describe("NodeBookmarksStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useNodeBookmarksStore.setState({ bookmarks: [] });
  });

  describe("addBookmark", () => {
    it("should add a bookmark for a node", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 }, "Test Node");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0]).toMatchObject({
        nodeId: "node1",
        workflowId: "workflow1",
        label: "Test Node",
        position: { x: 100, y: 200 }
      });
      expect(result.current.bookmarks[0].timestamp).toBeDefined();
    });

    it("should not add duplicate bookmarks for the same node", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
      });

      expect(result.current.bookmarks).toHaveLength(1);
    });

    it("should enforce maximum bookmarks per workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        for (let i = 0; i < 55; i++) {
          result.current.addBookmark(`node${i}`, "workflow1", { x: i, y: i });
        }
      });

      expect(result.current.bookmarks).toHaveLength(50);
    });
  });

  describe("removeBookmark", () => {
    it("should remove a bookmark for a node", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.removeBookmark("node1", "workflow1");
      });

      expect(result.current.bookmarks).toHaveLength(0);
    });

    it("should only remove bookmark from specific workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.addBookmark("node1", "workflow2", { x: 100, y: 200 });
        result.current.removeBookmark("node1", "workflow1");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0].workflowId).toBe("workflow2");
    });
  });

  describe("toggleBookmark", () => {
    it("should add bookmark when node is not bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.toggleBookmark("node1", "workflow1", { x: 100, y: 200 }, "Test");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0].nodeId).toBe("node1");
    });

    it("should remove bookmark when node is already bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.toggleBookmark("node1", "workflow1", { x: 100, y: 200 });
      });

      expect(result.current.bookmarks).toHaveLength(0);
    });
  });

  describe("isBookmarked", () => {
    it("should return true when node is bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
      });

      expect(result.current.isBookmarked("node1", "workflow1")).toBe(true);
    });

    it("should return false when node is not bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      expect(result.current.isBookmarked("node1", "workflow1")).toBe(false);
    });

    it("should return false for different workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
      });

      expect(result.current.isBookmarked("node1", "workflow2")).toBe(false);
    });
  });

  describe("getWorkflowBookmarks", () => {
    it("should return all bookmarks for a workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.addBookmark("node2", "workflow1", { x: 200, y: 300 });
        result.current.addBookmark("node3", "workflow2", { x: 300, y: 400 });
      });

      const workflow1Bookmarks = result.current.getWorkflowBookmarks("workflow1");
      expect(workflow1Bookmarks).toHaveLength(2);
      expect(workflow1Bookmarks.map((b) => b.nodeId)).toEqual(["node1", "node2"]);
    });

    it("should return empty array for workflow with no bookmarks", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      const bookmarks = result.current.getWorkflowBookmarks("nonexistent");
      expect(bookmarks).toEqual([]);
    });
  });

  describe("updateBookmarkLabel", () => {
    it("should update bookmark label", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 }, "Original");
        result.current.updateBookmarkLabel("node1", "workflow1", "Updated");
      });

      expect(result.current.bookmarks[0].label).toBe("Updated");
    });

    it("should not update bookmark for different workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 }, "Original");
        result.current.updateBookmarkLabel("node1", "workflow2", "Updated");
      });

      expect(result.current.bookmarks[0].label).toBe("Original");
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("should clear all bookmarks for a workflow", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.addBookmark("node2", "workflow1", { x: 200, y: 300 });
        result.current.addBookmark("node3", "workflow2", { x: 300, y: 400 });
        result.current.clearWorkflowBookmarks("workflow1");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0].workflowId).toBe("workflow2");
    });
  });

  describe("cleanupBookmarks", () => {
    it("should remove bookmarks for deleted nodes", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.addBookmark("node2", "workflow1", { x: 200, y: 300 });
        result.current.addBookmark("node3", "workflow1", { x: 300, y: 400 });
        result.current.cleanupBookmarks(["node1", "node3"], "workflow1");
      });

      expect(result.current.bookmarks).toHaveLength(2);
      expect(result.current.bookmarks.map((b) => b.nodeId)).toEqual(["node1", "node3"]);
    });

    it("should not affect other workflows", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());

      act(() => {
        result.current.addBookmark("node1", "workflow1", { x: 100, y: 200 });
        result.current.addBookmark("node2", "workflow2", { x: 200, y: 300 });
        result.current.cleanupBookmarks([], "workflow1");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0].workflowId).toBe("workflow2");
    });
  });
});
