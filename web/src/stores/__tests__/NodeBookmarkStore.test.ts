import { useNodeBookmarkStore } from "../NodeBookmarkStore";

describe("NodeBookmarkStore", () => {
  beforeEach(() => {
    useNodeBookmarkStore.setState({ bookmarks: {} });
  });

  describe("toggleBookmark", () => {
    it("should add a bookmark when node is not bookmarked", () => {
      const workflowId = "workflow-1";
      const nodeId = "node-1";
      const nodeType = "nodetool.input.TextInput";
      const label = "Text Input";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        nodeId,
        nodeType,
        label
      );

      const bookmarks = useNodeBookmarkStore.getState().getBookmarks(workflowId);
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe(nodeId);
      expect(bookmarks[0].nodeType).toBe(nodeType);
      expect(bookmarks[0].label).toBe(label);
    });

    it("should remove a bookmark when node is already bookmarked", () => {
      const workflowId = "workflow-1";
      const nodeId = "node-1";
      const nodeType = "nodetool.input.TextInput";
      const label = "Text Input";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        nodeId,
        nodeType,
        label
      );

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        nodeId,
        nodeType,
        label
      );

      const bookmarks = useNodeBookmarkStore.getState().getBookmarks(workflowId);
      expect(bookmarks).toHaveLength(0);
    });

    it("should handle multiple workflows", () => {
      const workflowId1 = "workflow-1";
      const workflowId2 = "workflow-2";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId1,
        "node-1",
        "nodetool.input.TextInput",
        "Node 1"
      );

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId2,
        "node-2",
        "nodetool.input.ImageInput",
        "Node 2"
      );

      expect(
        useNodeBookmarkStore.getState().getBookmarks(workflowId1)
      ).toHaveLength(1);
      expect(
        useNodeBookmarkStore.getState().getBookmarks(workflowId2)
      ).toHaveLength(1);
    });

    it("should preserve existing bookmarks when adding new ones", () => {
      const workflowId = "workflow-1";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        "node-1",
        "nodetool.input.TextInput",
        "Node 1"
      );

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        "node-2",
        "nodetool.input.ImageInput",
        "Node 2"
      );

      const bookmarks = useNodeBookmarkStore.getState().getBookmarks(workflowId);
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks.map((b) => b.nodeId)).toEqual([
        "node-1",
        "node-2"
      ]);
    });
  });

  describe("isBookmarked", () => {
    it("should return true when node is bookmarked", () => {
      const workflowId = "workflow-1";
      const nodeId = "node-1";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        nodeId,
        "nodetool.input.TextInput",
        "Text Input"
      );

      expect(
        useNodeBookmarkStore.getState().isBookmarked(workflowId, nodeId)
      ).toBe(true);
    });

    it("should return false when node is not bookmarked", () => {
      const workflowId = "workflow-1";

      expect(
        useNodeBookmarkStore.getState().isBookmarked(workflowId, "node-1")
      ).toBe(false);
    });
  });

  describe("removeBookmark", () => {
    it("should remove a specific bookmark", () => {
      const workflowId = "workflow-1";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        "node-1",
        "nodetool.input.TextInput",
        "Node 1"
      );

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        "node-2",
        "nodetool.input.ImageInput",
        "Node 2"
      );

      useNodeBookmarkStore.getState().removeBookmark(workflowId, "node-1");

      const bookmarks = useNodeBookmarkStore.getState().getBookmarks(workflowId);
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].nodeId).toBe("node-2");
    });
  });

  describe("clearWorkflowBookmarks", () => {
    it("should remove all bookmarks for a workflow", () => {
      const workflowId1 = "workflow-1";
      const workflowId2 = "workflow-2";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId1,
        "node-1",
        "nodetool.input.TextInput",
        "Node 1"
      );

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId2,
        "node-2",
        "nodetool.input.ImageInput",
        "Node 2"
      );

      useNodeBookmarkStore.getState().clearWorkflowBookmarks(workflowId1);

      expect(
        useNodeBookmarkStore.getState().getBookmarks(workflowId1)
      ).toHaveLength(0);
      expect(
        useNodeBookmarkStore.getState().getBookmarks(workflowId2)
      ).toHaveLength(1);
    });
  });

  describe("updateBookmarkLabel", () => {
    it("should update the label of a bookmark", () => {
      const workflowId = "workflow-1";
      const nodeId = "node-1";

      useNodeBookmarkStore.getState().toggleBookmark(
        workflowId,
        nodeId,
        "nodetool.input.TextInput",
        "Original Label"
      );

      useNodeBookmarkStore.getState().updateBookmarkLabel(
        workflowId,
        nodeId,
        "Updated Label"
      );

      const bookmarks = useNodeBookmarkStore.getState().getBookmarks(workflowId);
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].label).toBe("Updated Label");
    });
  });

  describe("getBookmarks", () => {
    it("should return empty array for unknown workflow", () => {
      const bookmarks = useNodeBookmarkStore.getState().getBookmarks(
        "unknown-workflow"
      );
      expect(bookmarks).toEqual([]);
    });
  });
});
