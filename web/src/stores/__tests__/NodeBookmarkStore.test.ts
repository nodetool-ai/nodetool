import { useNodeBookmarkStore } from "../NodeBookmarkStore";
import { act } from "@testing-library/react";

describe("NodeBookmarkStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeBookmarkStore.setState({
        bookmarksByWorkflow: {}
      });
    });
  });

  describe("toggleBookmark", () => {
    it("should add a bookmark when none exists", () => {
      const { toggleBookmark, getBookmarks, isBookmarked } =
        useNodeBookmarkStore.getState();

      act(() => {
        toggleBookmark("workflow-1", "node-1", "Test Node", "nodetool.test.Node");
      });

      const bookmarks = getBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe("node-1");
      expect(bookmarks[0].label).toBe("Test Node");
      expect(bookmarks[0].nodeType).toBe("nodetool.test.Node");
      expect(isBookmarked("workflow-1", "node-1")).toBe(true);
    });

    it("should remove a bookmark when it already exists", () => {
      const { toggleBookmark, getBookmarks, isBookmarked } =
        useNodeBookmarkStore.getState();

      act(() => {
        toggleBookmark("workflow-1", "node-1", "Test Node", "nodetool.test.Node");
      });
      expect(isBookmarked("workflow-1", "node-1")).toBe(true);

      act(() => {
        toggleBookmark("workflow-1", "node-1", "Test Node", "nodetool.test.Node");
      });
      expect(isBookmarked("workflow-1", "node-1")).toBe(false);
      expect(getBookmarks("workflow-1")).toHaveLength(0);
    });

    it("should handle multiple bookmarks in same workflow", () => {
      const { toggleBookmark, getBookmarks } = useNodeBookmarkStore.getState();

      act(() => {
        toggleBookmark("workflow-1", "node-1", "Node 1", "type.A");
        toggleBookmark("workflow-1", "node-2", "Node 2", "type.B");
        toggleBookmark("workflow-1", "node-3", "Node 3", "type.C");
      });

      const bookmarks = getBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(3);
    });

    it("should keep bookmarks separate between workflows", () => {
      const { toggleBookmark, getBookmarks, isBookmarked } =
        useNodeBookmarkStore.getState();

      act(() => {
        toggleBookmark("workflow-1", "node-1", "Node 1", "type.A");
        toggleBookmark("workflow-2", "node-2", "Node 2", "type.B");
      });

      expect(getBookmarks("workflow-1")).toHaveLength(1);
      expect(getBookmarks("workflow-2")).toHaveLength(1);
      expect(isBookmarked("workflow-1", "node-1")).toBe(true);
      expect(isBookmarked("workflow-1", "node-2")).toBe(false);
      expect(isBookmarked("workflow-2", "node-2")).toBe(true);
    });
  });

  describe("removeBookmark", () => {
    it("should remove a specific bookmark", () => {
      const { toggleBookmark, removeBookmark, getBookmarks, isBookmarked } =
        useNodeBookmarkStore.getState();

      act(() => {
        toggleBookmark("workflow-1", "node-1", "Node 1", "type.A");
        toggleBookmark("workflow-1", "node-2", "Node 2", "type.B");
      });

      expect(getBookmarks("workflow-1")).toHaveLength(2);

      act(() => {
        removeBookmark("workflow-1", "node-1");
      });

      expect(getBookmarks("workflow-1")).toHaveLength(1);
      expect(isBookmarked("workflow-1", "node-1")).toBe(false);
      expect(isBookmarked("workflow-1", "node-2")).toBe(true);
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("should clear all bookmarks for a workflow", () => {
      const { toggleBookmark, clearWorkflowBookmarks, getBookmarks } =
        useNodeBookmarkStore.getState();

      act(() => {
        toggleBookmark("workflow-1", "node-1", "Node 1", "type.A");
        toggleBookmark("workflow-1", "node-2", "Node 2", "type.B");
        toggleBookmark("workflow-2", "node-3", "Node 3", "type.C");
      });

      expect(getBookmarks("workflow-1")).toHaveLength(2);
      expect(getBookmarks("workflow-2")).toHaveLength(1);

      act(() => {
        clearWorkflowBookmarks("workflow-1");
      });

      expect(getBookmarks("workflow-1")).toHaveLength(0);
      expect(getBookmarks("workflow-2")).toHaveLength(1);
    });
  });

  describe("getBookmarks", () => {
    it("should return empty array for workflow with no bookmarks", () => {
      const { getBookmarks } = useNodeBookmarkStore.getState();
      expect(getBookmarks("non-existent")).toEqual([]);
    });
  });
});
