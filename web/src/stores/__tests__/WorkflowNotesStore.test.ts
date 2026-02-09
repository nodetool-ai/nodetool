/**
 * Tests for WorkflowNotesStore
 */

import { renderHook, act } from "@testing-library/react";
import { useWorkflowNotesStore } from "../WorkflowNotesStore";

describe("WorkflowNotesStore", () => {
  beforeEach(() => {
    // Clear all notes before each test
    useWorkflowNotesStore.getState().notes = {};
  });

  describe("initial state", () => {
    it("should start with empty notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      expect(result.current.notes).toEqual({});
    });

    it("should return null for non-existent workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      const notes = result.current.getNotes("non-existent-workflow");
      expect(notes).toBeNull();
    });

    it("should return false for hasNotes on non-existent workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      expect(result.current.hasNotes("non-existent-workflow")).toBe(false);
    });
  });

  describe("updateNotes", () => {
    it("should add notes for a workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "# My Notes\n\nSome content");
      });
      
      expect(result.current.notes["workflow-1"]).toBeDefined();
      expect(result.current.notes["workflow-1"].content).toBe("# My Notes\n\nSome content");
      expect(result.current.notes["workflow-1"].workflowId).toBe("workflow-1");
      expect(result.current.notes["workflow-1"].updatedAt).toBeGreaterThan(0);
    });

    it("should update existing notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "Original content");
      });
      
      const firstUpdateTime = result.current.notes["workflow-1"].updatedAt;
      
      // Wait a bit to ensure timestamp changes
      jest.useRealTimers();
      setTimeout(() => {
        act(() => {
          result.current.updateNotes("workflow-1", "Updated content");
        });
        
        expect(result.current.notes["workflow-1"].content).toBe("Updated content");
        expect(result.current.notes["workflow-1"].updatedAt).toBeGreaterThan(firstUpdateTime);
      }, 10);
    });

    it("should store notes for multiple workflows", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "Notes for workflow 1");
        result.current.updateNotes("workflow-2", "Notes for workflow 2");
        result.current.updateNotes("workflow-3", "Notes for workflow 3");
      });
      
      expect(Object.keys(result.current.notes)).toHaveLength(3);
      expect(result.current.getNotes("workflow-1")).toBe("Notes for workflow 1");
      expect(result.current.getNotes("workflow-2")).toBe("Notes for workflow 2");
      expect(result.current.getNotes("workflow-3")).toBe("Notes for workflow 3");
    });
  });

  describe("getNotes", () => {
    it("should return notes content for existing workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "My workflow notes");
      });
      
      const notes = result.current.getNotes("workflow-1");
      expect(notes).toBe("My workflow notes");
    });

    it("should return null for non-existent workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      const notes = result.current.getNotes("non-existent");
      expect(notes).toBeNull();
    });
  });

  describe("hasNotes", () => {
    it("should return true when workflow has notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "Some notes");
      });
      
      expect(result.current.hasNotes("workflow-1")).toBe(true);
    });

    it("should return false when workflow has no notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      expect(result.current.hasNotes("workflow-1")).toBe(false);
    });

    it("should return false when workflow has empty notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "");
      });
      
      expect(result.current.hasNotes("workflow-1")).toBe(false);
    });
  });

  describe("deleteNotes", () => {
    it("should delete notes for a workflow", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "Notes to delete");
        result.current.deleteNotes("workflow-1");
      });
      
      expect(result.current.notes["workflow-1"]).toBeUndefined();
      expect(result.current.getNotes("workflow-1")).toBeNull();
      expect(result.current.hasNotes("workflow-1")).toBe(false);
    });

    it("should handle deleting non-existent notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      expect(() => {
        act(() => {
          result.current.deleteNotes("non-existent");
        });
      }).not.toThrow();
    });
  });

  describe("getAllNotes", () => {
    it("should return empty array when no notes exist", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      expect(result.current.getAllNotes()).toEqual([]);
    });

    it("should return all workflow notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        result.current.updateNotes("workflow-1", "Notes 1");
        result.current.updateNotes("workflow-2", "Notes 2");
        result.current.updateNotes("workflow-3", "Notes 3");
      });
      
      const allNotes = result.current.getAllNotes();
      expect(allNotes).toHaveLength(3);
      expect(allNotes.map((n) => n.workflowId)).toContain("workflow-1");
      expect(allNotes.map((n) => n.workflowId)).toContain("workflow-2");
      expect(allNotes.map((n) => n.workflowId)).toContain("workflow-3");
    });
  });

  describe("persistence", () => {
    it("should persist notes across hook instances", () => {
      const { result: firstInstance } = renderHook(() => useWorkflowNotesStore());
      
      act(() => {
        firstInstance.current.updateNotes("workflow-1", "Persistent notes");
      });
      
      // Create a new hook instance (simulating component re-mount)
      const { result: secondInstance } = renderHook(() => useWorkflowNotesStore());
      
      expect(secondInstance.current.getNotes("workflow-1")).toBe("Persistent notes");
    });
  });
});
