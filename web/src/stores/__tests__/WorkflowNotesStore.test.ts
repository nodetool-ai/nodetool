/**
 * Unit tests for WorkflowNotesStore
 */

import { renderHook, act } from "@testing-library/react";
import { useWorkflowNotesStore } from "../WorkflowNotesStore";

describe("WorkflowNotesStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowNotesStore.setState({ notes: {} });
  });

  describe("getNote", () => {
    it("should return undefined for non-existent workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      expect(result.current.getNote("non-existent")).toBeUndefined();
    });

    it("should return the note for existing workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "workflow-1";
      const noteContent = "Test note content";

      act(() => {
        result.current.setNote(workflowId, noteContent);
      });

      const note = result.current.getNote(workflowId);
      expect(note).toBeDefined();
      expect(note?.content).toBe(noteContent);
      expect(note?.workflowId).toBe(workflowId);
      expect(note?.id).toBe(`note-${workflowId}`);
    });
  });

  describe("setNote", () => {
    it("should create a new note for workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "workflow-1";
      const content = "New note";

      act(() => {
        result.current.setNote(workflowId, content);
      });

      const note = result.current.getNote(workflowId);
      expect(note).toBeDefined();
      expect(note?.content).toBe(content);
      expect(note?.createdAt).toBeDefined();
      expect(note?.updatedAt).toBeDefined();
    });

    it("should update existing note content", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "workflow-1";

      act(() => {
        result.current.setNote(workflowId, "Original content");
      });

      const firstNote = result.current.getNote(workflowId);
      const originalCreatedAt = firstNote?.createdAt;

      act(() => {
        result.current.setNote(workflowId, "Updated content");
      });

      const updatedNote = result.current.getNote(workflowId);
      expect(updatedNote?.content).toBe("Updated content");
      expect(updatedNote?.createdAt).toBe(originalCreatedAt); // createdAt should not change
      expect(updatedNote?.updatedAt).not.toBe(originalCreatedAt); // updatedAt should change
    });

    it("should handle empty content", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "workflow-1";

      act(() => {
        result.current.setNote(workflowId, "");
      });

      const note = result.current.getNote(workflowId);
      expect(note).toBeDefined();
      expect(note?.content).toBe("");
    });
  });

  describe("updateNote", () => {
    it("should update note content if note exists", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "workflow-1";

      act(() => {
        result.current.setNote(workflowId, "Original");
      });

      const originalNote = result.current.getNote(workflowId);

      act(() => {
        result.current.updateNote(workflowId, "Updated");
      });

      const updatedNote = result.current.getNote(workflowId);
      expect(updatedNote?.content).toBe("Updated");
      expect(updatedNote?.createdAt).toBe(originalNote?.createdAt);
    });

    it("should not create note if it does not exist", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "non-existent";

      act(() => {
        result.current.updateNote(workflowId, "Should not create");
      });

      expect(result.current.getNote(workflowId)).toBeUndefined();
    });
  });

  describe("deleteNote", () => {
    it("should delete existing note", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "workflow-1";

      act(() => {
        result.current.setNote(workflowId, "To be deleted");
      });

      expect(result.current.hasNote(workflowId)).toBe(true);

      act(() => {
        result.current.deleteNote(workflowId);
      });

      expect(result.current.getNote(workflowId)).toBeUndefined();
      expect(result.current.hasNote(workflowId)).toBe(false);
    });

    it("should handle deleting non-existent note gracefully", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      expect(() => {
        act(() => {
          result.current.deleteNote("non-existent");
        });
      }).not.toThrow();
    });
  });

  describe("hasNote", () => {
    it("should return true for workflow with note", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      const workflowId = "workflow-1";

      expect(result.current.hasNote(workflowId)).toBe(false);

      act(() => {
        result.current.setNote(workflowId, "Note content");
      });

      expect(result.current.hasNote(workflowId)).toBe(true);
    });

    it("should return false for workflow without note", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      expect(result.current.hasNote("non-existent")).toBe(false);
    });
  });

  describe("multiple workflows", () => {
    it("should handle notes for multiple workflows independently", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.setNote("workflow-1", "Note 1");
        result.current.setNote("workflow-2", "Note 2");
        result.current.setNote("workflow-3", "Note 3");
      });

      expect(result.current.getNote("workflow-1")?.content).toBe("Note 1");
      expect(result.current.getNote("workflow-2")?.content).toBe("Note 2");
      expect(result.current.getNote("workflow-3")?.content).toBe("Note 3");

      act(() => {
        result.current.deleteNote("workflow-2");
      });

      expect(result.current.getNote("workflow-1")?.content).toBe("Note 1");
      expect(result.current.getNote("workflow-2")).toBeUndefined();
      expect(result.current.getNote("workflow-3")?.content).toBe("Note 3");
    });
  });
});
