import { act } from "@testing-library/react";
import { useNodeBookmarkStore } from "../NodeBookmarkStore";

describe("NodeBookmarkStore", () => {
  beforeEach(() => {
    // Clear all bookmarks before each test
    const { clearAllBookmarks } = useNodeBookmarkStore.getState();
    clearAllBookmarks();
  });

  describe("setBookmark", () => {
    it("should add a bookmark for a node", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark(
          "workflow-1",
          "node-1",
          "test_type",
          "Test Node",
          { x: 100, y: 200 },
          1
        );
      });

      const bookmarks = getState().bookmarks["workflow-1"];
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0]).toMatchObject({
        nodeId: "node-1",
        nodeType: "test_type",
        nodeName: "Test Node",
        position: { x: 100, y: 200 },
        index: 1
      });
    });

    it("should not allow bookmarks outside the 1-9 range", () => {
      const { getState } = useNodeBookmarkStore;
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Test", { x: 0, y: 0 }, 0);
        getState().setBookmark("workflow-1", "node-1", "test", "Test", { x: 0, y: 0 }, 10);
      });

      expect(getState().bookmarks["workflow-1"] || []).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      consoleWarnSpy.mockRestore();
    });

    it("should replace existing bookmark at the same index", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-1", "node-2", "test", "Node 2", { x: 100, y: 100 }, 1);
      });

      const bookmarks = getState().bookmarks["workflow-1"];
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe("node-2");
    });

    it("should remove old bookmark when node is re-bookmarked at different index", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 2);
      });

      const bookmarks = getState().bookmarks["workflow-1"];
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].index).toBe(2);
    });

    it("should maintain separate bookmarks for different workflows", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-2", "node-2", "test", "Node 2", { x: 100, y: 100 }, 1);
      });

      expect(getState().bookmarks["workflow-1"]).toHaveLength(1);
      expect(getState().bookmarks["workflow-2"]).toHaveLength(1);
      expect(getState().bookmarks["workflow-1"][0].nodeId).toBe("node-1");
      expect(getState().bookmarks["workflow-2"][0].nodeId).toBe("node-2");
    });
  });

  describe("removeBookmark", () => {
    it("should remove bookmark by index", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-1", "node-2", "test", "Node 2", { x: 100, y: 100 }, 2);
        getState().removeBookmark("workflow-1", 1);
      });

      const bookmarks = getState().bookmarks["workflow-1"];
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].index).toBe(2);
    });
  });

  describe("removeBookmarkByNodeId", () => {
    it("should remove bookmark for a specific node", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-1", "node-2", "test", "Node 2", { x: 100, y: 100 }, 2);
        getState().removeBookmarkByNodeId("workflow-1", "node-1");
      });

      const bookmarks = getState().bookmarks["workflow-1"];
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe("node-2");
    });
  });

  describe("getBookmark", () => {
    it("should return bookmark at specified index", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
      });

      const bookmark = getState().getBookmark("workflow-1", 1);
      expect(bookmark).toMatchObject({
        nodeId: "node-1",
        index: 1
      });
    });

    it("should return undefined for non-existent bookmark", () => {
      const { getState } = useNodeBookmarkStore;

      const bookmark = getState().getBookmark("workflow-1", 1);
      expect(bookmark).toBeUndefined();
    });
  });

  describe("getBookmarksForWorkflow", () => {
    it("should return all bookmarks for a workflow", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-1", "node-2", "test", "Node 2", { x: 100, y: 100 }, 2);
        getState().setBookmark("workflow-2", "node-3", "test", "Node 3", { x: 200, y: 200 }, 1);
      });

      const workflow1Bookmarks = getState().getBookmarksForWorkflow("workflow-1");
      expect(workflow1Bookmarks).toHaveLength(2);

      const workflow2Bookmarks = getState().getBookmarksForWorkflow("workflow-2");
      expect(workflow2Bookmarks).toHaveLength(1);
    });

    it("should return empty array for workflow with no bookmarks", () => {
      const { getState } = useNodeBookmarkStore;

      const bookmarks = getState().getBookmarksForWorkflow("non-existent");
      expect(bookmarks).toEqual([]);
    });
  });

  describe("hasBookmarkAt", () => {
    it("should return true when bookmark exists at index", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
      });

      expect(getState().hasBookmarkAt("workflow-1", 1)).toBe(true);
      expect(getState().hasBookmarkAt("workflow-1", 2)).toBe(false);
    });
  });

  describe("getBookmarkForNode", () => {
    it("should return bookmark for a specific node", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
      });

      const bookmark = getState().getBookmarkForNode("workflow-1", "node-1");
      expect(bookmark).toMatchObject({
        nodeId: "node-1",
        index: 1
      });
    });

    it("should return undefined for non-bookmarked node", () => {
      const { getState } = useNodeBookmarkStore;

      const bookmark = getState().getBookmarkForNode("workflow-1", "node-1");
      expect(bookmark).toBeUndefined();
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("should clear all bookmarks for a workflow", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-1", "node-2", "test", "Node 2", { x: 100, y: 100 }, 2);
        getState().setBookmark("workflow-2", "node-3", "test", "Node 3", { x: 200, y: 200 }, 1);
        getState().clearWorkflowBookmarks("workflow-1");
      });

      expect(getState().bookmarks["workflow-1"] || []).toHaveLength(0);
      expect(getState().bookmarks["workflow-2"]).toHaveLength(1);
    });
  });

  describe("clearAllBookmarks", () => {
    it("should clear all bookmarks across all workflows", () => {
      const { getState } = useNodeBookmarkStore;

      act(() => {
        getState().setBookmark("workflow-1", "node-1", "test", "Node 1", { x: 0, y: 0 }, 1);
        getState().setBookmark("workflow-2", "node-2", "test", "Node 2", { x: 100, y: 100 }, 1);
        getState().clearAllBookmarks();
      });

      expect(getState().bookmarks).toEqual({});
    });
  });
});
