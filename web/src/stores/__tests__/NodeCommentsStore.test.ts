import { act } from "@testing-library/react";
import useNodeCommentsStore from "../NodeCommentsStore";

describe("NodeCommentsStore", () => {
  beforeEach(() => {
    useNodeCommentsStore.setState({
      comments: {},
      activeCommentNodeId: null
    });
  });

  describe("initial state", () => {
    it("has empty comments object", () => {
      const { comments } = useNodeCommentsStore.getState();
      expect(comments).toEqual({});
    });

    it("has null activeCommentNodeId", () => {
      const { activeCommentNodeId } = useNodeCommentsStore.getState();
      expect(activeCommentNodeId).toBeNull();
    });
  });

  describe("addComment", () => {
    it("adds a comment for a node", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "This is a test comment");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(Object.keys(comments)).toHaveLength(1);
      expect(comments["node1"]).toBeDefined();
      expect(comments["node1"].text).toBe("This is a test comment");
      expect(comments["node1"].nodeId).toBe("node1");
      expect(comments["node1"].createdAt).toBeDefined();
      expect(comments["node1"].updatedAt).toBeDefined();
    });

    it("trims whitespace from comment text", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "  Test comment with whitespace  ");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(comments["node1"].text).toBe("Test comment with whitespace");
    });

    it("can add comments to multiple nodes", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Comment 1");
        useNodeCommentsStore.getState().addComment("node2", "Comment 2");
        useNodeCommentsStore.getState().addComment("node3", "Comment 3");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(Object.keys(comments)).toHaveLength(3);
      expect(comments["node1"].text).toBe("Comment 1");
      expect(comments["node2"].text).toBe("Comment 2");
      expect(comments["node3"].text).toBe("Comment 3");
    });
  });

  describe("getComment", () => {
    it("returns undefined for non-existent node", () => {
      const comment = useNodeCommentsStore.getState().getComment("non-existent");
      expect(comment).toBeUndefined();
    });

    it("returns the comment for an existing node", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Test comment");
      });

      const comment = useNodeCommentsStore.getState().getComment("node1");
      expect(comment).toBeDefined();
      expect(comment?.text).toBe("Test comment");
    });
  });

  describe("hasComment", () => {
    it("returns false for non-existent node", () => {
      const hasComment = useNodeCommentsStore.getState().hasComment("non-existent");
      expect(hasComment).toBe(false);
    });

    it("returns true for existing node", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Test comment");
      });

      const hasComment = useNodeCommentsStore.getState().hasComment("node1");
      expect(hasComment).toBe(true);
    });
  });

  describe("updateComment", () => {
    it("updates an existing comment", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Original comment");
      });

      const originalCreatedAt = useNodeCommentsStore.getState().getComment("node1")?.createdAt;

      act(() => {
        useNodeCommentsStore.getState().updateComment("node1", "Updated comment");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(comments["node1"].text).toBe("Updated comment");
      expect(comments["node1"].createdAt).toBe(originalCreatedAt);
      expect(comments["node1"].updatedAt).toBeGreaterThanOrEqual(comments["node1"].createdAt);
    });

    it("trims whitespace when updating", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Original");
      });

      act(() => {
        useNodeCommentsStore.getState().updateComment("node1", "  Updated  ");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(comments["node1"].text).toBe("Updated");
    });

    it("does nothing if comment does not exist", () => {
      act(() => {
        useNodeCommentsStore.getState().updateComment("non-existent", "Should not be added");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(comments).toEqual({});
    });
  });

  describe("deleteComment", () => {
    it("deletes a comment", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Comment to delete");
      });

      expect(useNodeCommentsStore.getState().hasComment("node1")).toBe(true);

      act(() => {
        useNodeCommentsStore.getState().deleteComment("node1");
      });

      expect(useNodeCommentsStore.getState().hasComment("node1")).toBe(false);
      expect(useNodeCommentsStore.getState().getComment("node1")).toBeUndefined();
    });

    it("does not affect other comments", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Comment 1");
        useNodeCommentsStore.getState().addComment("node2", "Comment 2");
      });

      act(() => {
        useNodeCommentsStore.getState().deleteComment("node1");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(Object.keys(comments)).toHaveLength(1);
      expect(comments["node2"]).toBeDefined();
      expect(comments["node2"].text).toBe("Comment 2");
    });

    it("does nothing if comment does not exist", () => {
      act(() => {
        useNodeCommentsStore.getState().deleteComment("non-existent");
      });

      const { comments } = useNodeCommentsStore.getState();
      expect(comments).toEqual({});
    });
  });

  describe("getAllComments", () => {
    it("returns empty array when no comments", () => {
      const allComments = useNodeCommentsStore.getState().getAllComments();
      expect(allComments).toEqual([]);
    });

    it("returns all comments as an array", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Comment 1");
        useNodeCommentsStore.getState().addComment("node2", "Comment 2");
      });

      const allComments = useNodeCommentsStore.getState().getAllComments();
      expect(allComments).toHaveLength(2);
      expect(allComments.map(c => c.text)).toContain("Comment 1");
      expect(allComments.map(c => c.text)).toContain("Comment 2");
    });
  });

  describe("setActiveCommentNodeId", () => {
    it("sets the active comment node id", () => {
      act(() => {
        useNodeCommentsStore.getState().setActiveCommentNodeId("node1");
      });

      expect(useNodeCommentsStore.getState().activeCommentNodeId).toBe("node1");
    });

    it("can set to null", () => {
      act(() => {
        useNodeCommentsStore.getState().setActiveCommentNodeId("node1");
        useNodeCommentsStore.getState().setActiveCommentNodeId(null);
      });

      expect(useNodeCommentsStore.getState().activeCommentNodeId).toBeNull();
    });
  });

  describe("clearComments", () => {
    it("clears all comments", () => {
      act(() => {
        useNodeCommentsStore.getState().addComment("node1", "Comment 1");
        useNodeCommentsStore.getState().addComment("node2", "Comment 2");
        useNodeCommentsStore.getState().addComment("node3", "Comment 3");
      });

      expect(useNodeCommentsStore.getState().getAllComments()).toHaveLength(3);

      act(() => {
        useNodeCommentsStore.getState().clearComments();
      });

      const { comments, activeCommentNodeId } = useNodeCommentsStore.getState();
      expect(comments).toEqual({});
      expect(activeCommentNodeId).toBeNull();
    });
  });
});
