import { useWorkflowNotesStore } from "../WorkflowNotesStore";
import { useWorkflowNotesPanelStore } from "../WorkflowNotesPanelStore";

// Mock crypto.randomUUID for tests
let uuidCounter = 0;
const originalRandomUUID = typeof crypto !== "undefined" ? crypto.randomUUID : undefined;

// Setup before all tests
beforeAll(() => {
  if (typeof crypto !== "undefined") {
    (crypto as any).randomUUID = jest.fn(() => `mock-uuid-${++uuidCounter}`);
  }
});

// Restore after all tests
afterAll(() => {
  if (typeof crypto !== "undefined" && originalRandomUUID) {
    crypto.randomUUID = originalRandomUUID;
  }
});

// Clear store state before each test
beforeEach(() => {
  uuidCounter = 0;
  useWorkflowNotesStore.setState({ notesByWorkflow: {} });
  useWorkflowNotesPanelStore.setState({ isVisible: false });
});

describe("WorkflowNotesStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("addNote", () => {
    it("should add a note to the workflow", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Test note");

      const notes = store.getNotes("workflow-1");
      expect(notes).toHaveLength(1);
      expect(notes[0].content).toBe("Test note");
    });

    it("should create separate notes for different workflows", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Note for workflow 1");
      store.addNote("workflow-2", "Note for workflow 2");

      expect(store.getNotes("workflow-1")).toHaveLength(1);
      expect(store.getNotes("workflow-2")).toHaveLength(1);
      expect(store.getNotes("workflow-1")[0].content).toBe("Note for workflow 1");
      expect(store.getNotes("workflow-2")[0].content).toBe("Note for workflow 2");
    });

    it("should trim whitespace from note content", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "  Test note with whitespace  ");

      const notes = store.getNotes("workflow-1");
      expect(notes[0].content).toBe("Test note with whitespace");
    });
  });

  describe("updateNote", () => {
    it("should update an existing note", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Original content");
      const noteId = store.getNotes("workflow-1")[0].id;

      store.updateNote("workflow-1", noteId, "Updated content");

      const notes = store.getNotes("workflow-1");
      expect(notes).toHaveLength(1);
      expect(notes[0].content).toBe("Updated content");
    });

    it("should update the updatedAt timestamp", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Original content");
      const note = store.getNotes("workflow-1")[0];
      const originalUpdatedAt = note.updatedAt;

      // Wait a bit to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }

      store.updateNote("workflow-1", note.id, "Updated content");

      const updatedNote = store.getNotes("workflow-1")[0];
      expect(updatedNote.updatedAt).not.toBe(originalUpdatedAt);
      expect(updatedNote.updatedAt > originalUpdatedAt).toBe(true);
    });
  });

  describe("deleteNote", () => {
    it("should delete a note", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Test note 1");
      store.addNote("workflow-1", "Test note 2");
      const noteId = store.getNotes("workflow-1")[0].id;

      store.deleteNote("workflow-1", noteId);

      const notes = store.getNotes("workflow-1");
      expect(notes).toHaveLength(1);
      expect(notes[0].content).toBe("Test note 2");
    });

    it("should handle deleting non-existent note gracefully", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Test note");

      store.deleteNote("workflow-1", "non-existent-id");

      expect(store.getNotes("workflow-1")).toHaveLength(1);
    });
  });

  describe("getNotes", () => {
    it("should return empty array for workflow with no notes", () => {
      const store = useWorkflowNotesStore.getState();
      const notes = store.getNotes("non-existent-workflow");
      expect(notes).toEqual([]);
    });
  });

  describe("clearNotes", () => {
    it("should clear all notes for a workflow", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Test note 1");
      store.addNote("workflow-1", "Test note 2");

      store.clearNotes("workflow-1");

      expect(store.getNotes("workflow-1")).toEqual([]);
    });

    it("should not affect notes for other workflows", () => {
      const store = useWorkflowNotesStore.getState();
      store.addNote("workflow-1", "Test note 1");
      store.addNote("workflow-2", "Test note 2");

      store.clearNotes("workflow-1");

      expect(store.getNotes("workflow-1")).toEqual([]);
      expect(store.getNotes("workflow-2")).toHaveLength(1);
    });
  });
});

describe("WorkflowNotesPanelStore", () => {
  beforeEach(() => {
    useWorkflowNotesPanelStore.setState({ isVisible: false });
  });

  describe("visibility controls", () => {
    it("should start with isVisible as false", () => {
      expect(useWorkflowNotesPanelStore.getState().isVisible).toBe(false);
    });

    it("should set visibility to true", () => {
      useWorkflowNotesPanelStore.getState().setVisible(true);
      expect(useWorkflowNotesPanelStore.getState().isVisible).toBe(true);
    });

    it("should toggle visibility", () => {
      expect(useWorkflowNotesPanelStore.getState().isVisible).toBe(false);

      useWorkflowNotesPanelStore.getState().toggle();
      expect(useWorkflowNotesPanelStore.getState().isVisible).toBe(true);

      useWorkflowNotesPanelStore.getState().toggle();
      expect(useWorkflowNotesPanelStore.getState().isVisible).toBe(false);
    });
  });
});
