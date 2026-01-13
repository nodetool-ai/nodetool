import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import useNodeBookmarkStore from "../NodeBookmarkStore";

describe("NodeBookmarkStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeBookmarkStore.setState({ bookmarks: {} });
    });
    localStorage.removeItem("node-bookmarks");
  });

  describe("addBookmark", () => {
    it("should add a bookmark for a node", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
      });
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe("node-1");
    });

    it("should add a bookmark with a label", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1", "My Node");
      });
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].label).toBe("My Node");
    });

    it("should not add duplicate bookmarks", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
      });
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(1);
    });
  });

  describe("removeBookmark", () => {
    it("should remove a bookmark", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-2");
        useNodeBookmarkStore.getState().removeBookmark("workflow-1", "node-1");
      });
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe("node-2");
    });
  });

  describe("toggleBookmark", () => {
    it("should add a bookmark when not present", () => {
      act(() => {
        useNodeBookmarkStore.getState().toggleBookmark("workflow-1", "node-1");
      });
      expect(useNodeBookmarkStore.getState().isBookmarked("workflow-1", "node-1")).toBe(true);
    });

    it("should remove a bookmark when present", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
        useNodeBookmarkStore.getState().toggleBookmark("workflow-1", "node-1");
      });
      expect(useNodeBookmarkStore.getState().isBookmarked("workflow-1", "node-1")).toBe(false);
    });
  });

  describe("isBookmarked", () => {
    it("should return true for bookmarked node", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
      });
      expect(useNodeBookmarkStore.getState().isBookmarked("workflow-1", "node-1")).toBe(true);
    });

    it("should return false for non-bookmarked node", () => {
      expect(useNodeBookmarkStore.getState().isBookmarked("workflow-1", "node-1")).toBe(false);
    });
  });

  describe("getBookmarks", () => {
    it("should return empty array for workflow with no bookmarks", () => {
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(bookmarks).toEqual([]);
    });

    it("should return all bookmarks for a workflow", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-2");
      });
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(bookmarks).toHaveLength(2);
    });

    it("should return bookmarks for specific workflow only", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
        useNodeBookmarkStore.getState().addBookmark("workflow-2", "node-2");
      });
      const workflow1Bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(workflow1Bookmarks).toHaveLength(1);
      expect(workflow1Bookmarks[0].nodeId).toBe("node-1");
    });
  });

  describe("updateBookmarkLabel", () => {
    it("should update the label of an existing bookmark", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1", "Original");
        useNodeBookmarkStore.getState().updateBookmarkLabel("workflow-1", "node-1", "Updated");
      });
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks("workflow-1");
      expect(bookmarks[0].label).toBe("Updated");
    });
  });

  describe("clearBookmarks", () => {
    it("should clear all bookmarks for a workflow", () => {
      act(() => {
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-1");
        useNodeBookmarkStore.getState().addBookmark("workflow-1", "node-2");
        useNodeBookmarkStore.getState().addBookmark("workflow-2", "node-3");
        useNodeBookmarkStore.getState().clearBookmarks("workflow-1");
      });
      expect(useNodeBookmarkStore.getState().getBookmarks("workflow-1")).toEqual([]);
      expect(useNodeBookmarkStore.getState().getBookmarks("workflow-2")).toHaveLength(1);
    });
  });
});
