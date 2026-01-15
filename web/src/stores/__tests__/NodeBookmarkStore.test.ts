import { useNodeBookmarkStore } from "../NodeBookmarkStore";

describe("NodeBookmarkStore", () => {
  beforeEach(() => {
    useNodeBookmarkStore.setState({ bookmarks: [] });
  });

  describe("addBookmark", () => {
    it("adds a bookmark for a node in a workflow", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0]).toEqual({
        nodeId: "node-1",
        workflowId: "workflow-1",
        timestamp: expect.any(Number)
      });
    });

    it("does not add duplicate bookmarks", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(1);
    });

    it("allows bookmarks for same node in different workflows", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-2");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(2);
    });

    it("allows different nodes in same workflow", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-2", "workflow-1");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(2);
    });
  });

  describe("removeBookmark", () => {
    it("removes a bookmark", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().removeBookmark("node-1", "workflow-1");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(0);
    });

    it("only removes the specified bookmark", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-2", "workflow-1");
      useNodeBookmarkStore.getState().removeBookmark("node-1", "workflow-1");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe("node-2");
    });

    it("does not affect bookmarks in other workflows", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-2");
      useNodeBookmarkStore.getState().removeBookmark("node-1", "workflow-1");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].workflowId).toBe("workflow-2");
    });
  });

  describe("isBookmarked", () => {
    it("returns true for bookmarked node", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");

      expect(
        useNodeBookmarkStore.getState().isBookmarked("node-1", "workflow-1")
      ).toBe(true);
    });

    it("returns false for non-bookmarked node", () => {
      expect(
        useNodeBookmarkStore.getState().isBookmarked("node-1", "workflow-1")
      ).toBe(false);
    });

    it("returns false for bookmarked node in different workflow", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");

      expect(
        useNodeBookmarkStore.getState().isBookmarked("node-1", "workflow-2")
      ).toBe(false);
    });
  });

  describe("toggleBookmark", () => {
    it("adds bookmark when not bookmarked", () => {
      useNodeBookmarkStore.getState().toggleBookmark("node-1", "workflow-1");

      expect(
        useNodeBookmarkStore.getState().isBookmarked("node-1", "workflow-1")
      ).toBe(true);
    });

    it("removes bookmark when already bookmarked", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().toggleBookmark("node-1", "workflow-1");

      expect(
        useNodeBookmarkStore.getState().isBookmarked("node-1", "workflow-1")
      ).toBe(false);
    });
  });

  describe("getWorkflowBookmarks", () => {
    it("returns all bookmarks for a workflow", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-2", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-3", "workflow-2");

      const workflow1Bookmarks = useNodeBookmarkStore
        .getState()
        .getWorkflowBookmarks("workflow-1");

      expect(workflow1Bookmarks).toHaveLength(2);
      expect(workflow1Bookmarks.map((b) => b.nodeId).sort()).toEqual([
        "node-1",
        "node-2"
      ]);
    });

    it("returns empty array for workflow with no bookmarks", () => {
      const bookmarks = useNodeBookmarkStore
        .getState()
        .getWorkflowBookmarks("workflow-nonexistent");

      expect(bookmarks).toHaveLength(0);
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("clears all bookmarks for a workflow", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-2", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-3", "workflow-2");

      useNodeBookmarkStore
        .getState()
        .clearWorkflowBookmarks("workflow-1");

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].workflowId).toBe("workflow-2");
    });
  });

  describe("clearAllBookmarks", () => {
    it("clears all bookmarks", () => {
      useNodeBookmarkStore.getState().addBookmark("node-1", "workflow-1");
      useNodeBookmarkStore.getState().addBookmark("node-2", "workflow-2");

      useNodeBookmarkStore.getState().clearAllBookmarks();

      const bookmarks = useNodeBookmarkStore.getState().bookmarks;
      expect(bookmarks).toHaveLength(0);
    });
  });
});
