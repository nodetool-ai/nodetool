import { renderHook, act } from "@testing-library/react";
import { useWorkflowCommentStore } from "../WorkflowCommentStore";

describe("WorkflowCommentStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowCommentStore.setState({
      comments: {},
      selectedCommentId: null
    });
  });

  const mockWorkflowId = "workflow-123";
  const mockComment = {
    workflowId: mockWorkflowId,
    content: "This is a test comment",
    author: "Test User",
    isResolved: false
  };

  describe("addComment", () => {
    it("should add a new comment to a workflow", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.addComment(mockComment);
      });

      const comments = result.current.getWorkflowComments(mockWorkflowId);
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe(mockComment.content);
      expect(comments[0].author).toBe(mockComment.author);
      expect(comments[0].isResolved).toBe(false);
    });

    it("should assign a unique ID to the comment", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];

      act(() => {
        ids.push(result.current.addComment(mockComment));
        ids.push(result.current.addComment(mockComment));
      });

      expect(ids[0]).toBeDefined();
      expect(ids[1]).toBeDefined();
      expect(ids[0]).not.toEqual(ids[1]);
    });

    it("should set default author to 'Anonymous' when not provided", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.addComment({
          workflowId: mockWorkflowId,
          content: "Test",
          author: "",
          isResolved: false
        });
      });

      const comments = result.current.getWorkflowComments(mockWorkflowId);
      expect(comments[0].author).toBe("Anonymous");
    });

    it("should include position when provided", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.addComment({
          ...mockComment,
          position: { x: 100, y: 200 }
        });
      });

      const comments = result.current.getWorkflowComments(mockWorkflowId);
      expect(comments[0].position).toEqual({ x: 100, y: 200 });
    });

    it("should include nodeId when provided", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.addComment({
          ...mockComment,
          nodeId: "node-456"
        });
      });

      const comments = result.current.getWorkflowComments(mockWorkflowId);
      expect(comments[0].nodeId).toBe("node-456");
    });
  });

  describe("updateComment", () => {
    it("should update an existing comment", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];
      act(() => {
        ids.push(result.current.addComment(mockComment));
      });

      act(() => {
        result.current.updateComment(ids[0], {
          content: "Updated content"
        });
      });

      const comments = result.current.getWorkflowComments(mockWorkflowId);
      expect(comments[0].content).toBe("Updated content");
    });

    it("should update the updatedAt timestamp", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];
      let originalTimestamp = "";
      act(() => {
        ids.push(result.current.addComment(mockComment));
        originalTimestamp = result.current.getComment(ids[0])?.updatedAt || "";
      });

      // Wait a bit to ensure timestamp difference
      return new Promise((resolve) => {
        setTimeout(() => {
          act(() => {
            result.current.updateComment(ids[0], {
              content: "Updated"
            });
          });

          const comment = result.current.getComment(ids[0]);
          expect(comment?.updatedAt).not.toBe(originalTimestamp);
          resolve(null);
        }, 10);
      });
    });

    it("should not modify comments if commentId is not found", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.addComment(mockComment);
      });

      const originalComments = result.current.getWorkflowComments(mockWorkflowId);

      act(() => {
        result.current.updateComment("non-existent-id", {
          content: "Updated"
        });
      });

      const comments = result.current.getWorkflowComments(mockWorkflowId);
      expect(comments).toEqual(originalComments);
    });
  });

  describe("deleteComment", () => {
    it("should delete a comment by ID", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];
      act(() => {
        ids.push(result.current.addComment(mockComment));
      });

      expect(result.current.getWorkflowComments(mockWorkflowId)).toHaveLength(1);

      act(() => {
        result.current.deleteComment(ids[0]);
      });

      expect(result.current.getWorkflowComments(mockWorkflowId)).toHaveLength(0);
    });

    it("should only delete the specified comment", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];
      act(() => {
        ids.push(result.current.addComment(mockComment));
        ids.push(result.current.addComment({
          ...mockComment,
          content: "Second comment"
        }));
      });

      act(() => {
        result.current.deleteComment(ids[0]);
      });

      const comments = result.current.getWorkflowComments(mockWorkflowId);
      expect(comments).toHaveLength(1);
      expect(comments[0].id).toBe(ids[1]);
    });
  });

  describe("toggleCommentResolved", () => {
    it("should toggle isResolved status", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];
      act(() => {
        ids.push(result.current.addComment({
          ...mockComment,
          isResolved: false
        }));
      });

      expect(result.current.getComment(ids[0])?.isResolved).toBe(false);

      act(() => {
        result.current.toggleCommentResolved(ids[0]);
      });

      expect(result.current.getComment(ids[0])?.isResolved).toBe(true);

      act(() => {
        result.current.toggleCommentResolved(ids[0]);
      });

      expect(result.current.getComment(ids[0])?.isResolved).toBe(false);
    });

    it("should update the updatedAt timestamp when toggling", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];
      let originalTimestamp = "";
      act(() => {
        ids.push(result.current.addComment(mockComment));
        originalTimestamp = result.current.getComment(ids[0])?.updatedAt || "";
      });

      return new Promise((resolve) => {
        setTimeout(() => {
          act(() => {
            result.current.toggleCommentResolved(ids[0]);
          });

          const comment = result.current.getComment(ids[0]);
          expect(comment?.updatedAt).not.toBe(originalTimestamp);
          resolve(null);
        }, 10);
      });
    });
  });

  describe("selectComment", () => {
    it("should set the selected comment ID", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.selectComment("comment-123");
      });

      expect(result.current.selectedCommentId).toBe("comment-123");
    });

    it("should clear selection when null is passed", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.selectComment("comment-123");
      });

      expect(result.current.selectedCommentId).toBe("comment-123");

      act(() => {
        result.current.selectComment(null);
      });

      expect(result.current.selectedCommentId).toBe(null);
    });
  });

  describe("getWorkflowComments", () => {
    it("should return empty array for workflow with no comments", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const comments = result.current.getWorkflowComments("non-existent-workflow");
      expect(comments).toEqual([]);
    });

    it("should return only comments for the specified workflow", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.addComment({ ...mockComment, workflowId: "workflow-1" });
        result.current.addComment({ ...mockComment, workflowId: "workflow-2" });
        result.current.addComment({ ...mockComment, workflowId: "workflow-1" });
      });

      const workflow1Comments = result.current.getWorkflowComments("workflow-1");
      const workflow2Comments = result.current.getWorkflowComments("workflow-2");

      expect(workflow1Comments).toHaveLength(2);
      expect(workflow2Comments).toHaveLength(1);
    });
  });

  describe("getComment", () => {
    it("should return undefined for non-existent comment", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const comment = result.current.getComment("non-existent");
      expect(comment).toBeUndefined();
    });

    it("should return the comment by ID", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      const ids: string[] = [];
      act(() => {
        ids.push(result.current.addComment(mockComment));
      });

      const comment = result.current.getComment(ids[0]);
      expect(comment).toBeDefined();
      expect(comment?.id).toBe(ids[0]);
      expect(comment?.content).toBe(mockComment.content);
    });
  });

  describe("clearWorkflowComments", () => {
    it("should remove all comments for a workflow", () => {
      const { result } = renderHook(() => useWorkflowCommentStore());

      act(() => {
        result.current.addComment({ ...mockComment, workflowId: "workflow-1" });
        result.current.addComment({ ...mockComment, workflowId: "workflow-2" });
        result.current.addComment({ ...mockComment, workflowId: "workflow-1" });
      });

      expect(result.current.getWorkflowComments("workflow-1")).toHaveLength(2);

      act(() => {
        result.current.clearWorkflowComments("workflow-1");
      });

      expect(result.current.getWorkflowComments("workflow-1")).toHaveLength(0);
      expect(result.current.getWorkflowComments("workflow-2")).toHaveLength(1);
    });
  });
});
