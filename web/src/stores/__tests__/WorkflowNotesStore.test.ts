import { renderHook, act } from "@testing-library/react";
import useWorkflowNotesStore from "../WorkflowNotesStore";
import { Workflow } from "../ApiTypes";

describe("WorkflowNotesStore", () => {
  beforeEach(() => {
    useWorkflowNotesStore.setState({
      notes: "",
      isEditing: false
    });
  });

  describe("initial state", () => {
    it("should initialize with empty notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      expect(result.current.notes).toBe("");
    });

    it("should initialize with isEditing as false", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());
      expect(result.current.isEditing).toBe(false);
    });
  });

  describe("setNotes", () => {
    it("should update notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.setNotes("# Test Notes");
      });

      expect(result.current.notes).toBe("# Test Notes");
    });

    it("should preserve previous notes when updating", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.setNotes("First note");
      });

      act(() => {
        result.current.setNotes("Second note");
      });

      expect(result.current.notes).toBe("Second note");
    });
  });

  describe("setIsEditing", () => {
    it("should update isEditing flag", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      expect(result.current.isEditing).toBe(false);

      act(() => {
        result.current.setIsEditing(true);
      });

      expect(result.current.isEditing).toBe(true);

      act(() => {
        result.current.setIsEditing(false);
      });

      expect(result.current.isEditing).toBe(false);
    });
  });

  describe("loadNotesFromWorkflow", () => {
    it("should load notes from workflow settings", () => {
      const mockWorkflow: Workflow = {
        id: "test-id",
        access: "private",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        name: "Test Workflow",
        description: "Test description",
        graph: { nodes: [], edges: [] },
        settings: {
          notes: "## My Notes\nThis is a test note."
        }
      };

      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.loadNotesFromWorkflow(mockWorkflow);
      });

      expect(result.current.notes).toBe("## My Notes\nThis is a test note.");
    });

    it("should handle workflow without settings", () => {
      const mockWorkflow: Workflow = {
        id: "test-id",
        access: "private",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        name: "Test Workflow",
        description: "Test description",
        graph: { nodes: [], edges: [] }
      };

      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.loadNotesFromWorkflow(mockWorkflow);
      });

      expect(result.current.notes).toBe("");
    });

    it("should handle workflow with empty settings", () => {
      const mockWorkflow: Workflow = {
        id: "test-id",
        access: "private",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        name: "Test Workflow",
        description: "Test description",
        graph: { nodes: [], edges: [] },
        settings: {}
      };

      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.loadNotesFromWorkflow(mockWorkflow);
      });

      expect(result.current.notes).toBe("");
    });

    it("should handle workflow with null notes in settings", () => {
      const mockWorkflow: Workflow = {
        id: "test-id",
        access: "private",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        name: "Test Workflow",
        description: "Test description",
        graph: { nodes: [], edges: [] },
        settings: {
          notes: null
        }
      };

      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.loadNotesFromWorkflow(mockWorkflow);
      });

      expect(result.current.notes).toBe("");
    });
  });

  describe("getNotesForSave", () => {
    it("should return notes for save when notes exist", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.setNotes("Test notes content");
      });

      const saveData = result.current.getNotesForSave();

      expect(saveData).toEqual({ notes: "Test notes content" });
    });

    it("should return null for notes when notes are empty", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      const saveData = result.current.getNotesForSave();

      expect(saveData).toEqual({ notes: null });
    });

    it("should return null for notes when notes are whitespace only", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.setNotes("   ");
      });

      const saveData = result.current.getNotesForSave();

      expect(saveData).toEqual({ notes: null });
    });
  });

  describe("clearNotes", () => {
    it("should clear all notes", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.setNotes("Some notes to clear");
      });

      expect(result.current.notes).toBe("Some notes to clear");

      act(() => {
        result.current.clearNotes();
      });

      expect(result.current.notes).toBe("");
    });
  });

  describe("state isolation", () => {
    it("should maintain separate state for notes and isEditing", () => {
      const { result } = renderHook(() => useWorkflowNotesStore());

      act(() => {
        result.current.setNotes("Test notes");
        result.current.setIsEditing(true);
      });

      expect(result.current.notes).toBe("Test notes");
      expect(result.current.isEditing).toBe(true);

      act(() => {
        result.current.setNotes("Updated notes");
      });

      expect(result.current.notes).toBe("Updated notes");
      expect(result.current.isEditing).toBe(true);

      act(() => {
        result.current.setIsEditing(false);
      });

      expect(result.current.notes).toBe("Updated notes");
      expect(result.current.isEditing).toBe(false);
    });
  });
});
