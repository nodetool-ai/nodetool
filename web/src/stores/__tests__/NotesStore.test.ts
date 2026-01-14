import useNotesStore from "../NotesStore";

describe("NotesStore", () => {
  beforeEach(() => {
    useNotesStore.setState({ notes: {}, selectedNoteId: null });
  });

  describe("addNote", () => {
    it("should add a new note with correct properties", () => {
      const { addNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 100, y: 200 });

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const allNotes = Object.values(useNotesStore.getState().notes);
      expect(allNotes).toHaveLength(1);
      expect(allNotes[0].content).toBe("Test note");
      expect(allNotes[0].position).toEqual({ x: 100, y: 200 });
      expect(allNotes[0].width).toBe(200);
      expect(allNotes[0].height).toBe(150);
      expect(allNotes[0].color).toBeDefined();
      expect(allNotes[0].createdAt).toBeGreaterThan(0);
      expect(allNotes[0].updatedAt).toBeGreaterThan(0);
    });

    it("should accept custom color", () => {
      const { addNote } = useNotesStore.getState().actions;
      const id = addNote("Colored note", { x: 100, y: 200 }, "#ff0000");

      const note = useNotesStore.getState().notes[id];
      expect(note.color).toBe("#ff0000");
    });

    it("should generate random color when not specified", () => {
      const { addNote } = useNotesStore.getState().actions;
      const id1 = addNote("Note 1", { x: 0, y: 0 });
      const id2 = addNote("Note 2", { x: 0, y: 0 });

      const note1 = useNotesStore.getState().notes[id1];
      const note2 = useNotesStore.getState().notes[id2];

      expect(note1.color).toBeDefined();
      expect(note2.color).toBeDefined();
      expect(note1.color).not.toBe("");
      expect(note2.color).not.toBe("");
    });
  });

  describe("updateNote", () => {
    it("should update note content", () => {
      const { addNote, updateNote } = useNotesStore.getState().actions;
      const id = addNote("Original content", { x: 0, y: 0 });

      updateNote(id, { content: "Updated content" });

      const note = useNotesStore.getState().notes[id];
      expect(note.content).toBe("Updated content");
      expect(note.updatedAt).toBeGreaterThanOrEqual(note.createdAt);
    });

    it("should update note position", () => {
      const { addNote, updateNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 0, y: 0 });

      updateNote(id, { position: { x: 500, y: 300 } });

      const note = useNotesStore.getState().notes[id];
      expect(note.position).toEqual({ x: 500, y: 300 });
    });

    it("should update note dimensions", () => {
      const { addNote, updateNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 0, y: 0 });

      updateNote(id, { width: 300, height: 200 });

      const note = useNotesStore.getState().notes[id];
      expect(note.width).toBe(300);
      expect(note.height).toBe(200);
    });

    it("should handle partial updates", () => {
      const { addNote, updateNote } = useNotesStore.getState().actions;
      const id = addNote("Original", { x: 0, y: 0 });
      const originalCreatedAt = useNotesStore.getState().notes[id].createdAt;

      updateNote(id, { content: "Updated" });

      const note = useNotesStore.getState().notes[id];
      expect(note.content).toBe("Updated");
      expect(note.position).toEqual({ x: 0, y: 0 });
      expect(note.createdAt).toBe(originalCreatedAt);
    });

    it("should do nothing for non-existent note", () => {
      const { updateNote } = useNotesStore.getState().actions;

      expect(() => {
        updateNote("non-existent-id", { content: "Should not error" });
      }).not.toThrow();
    });
  });

  describe("deleteNote", () => {
    it("should remove note from store", () => {
      const { addNote, deleteNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 0, y: 0 });

      expect(useNotesStore.getState().notes[id]).toBeDefined();

      deleteNote(id);

      expect(useNotesStore.getState().notes[id]).toBeUndefined();
    });

    it("should clear selectedNoteId when deleting selected note", () => {
      const { addNote, selectNote, deleteNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 0, y: 0 });

      selectNote(id);
      expect(useNotesStore.getState().selectedNoteId).toBe(id);

      deleteNote(id);

      expect(useNotesStore.getState().selectedNoteId).toBeNull();
    });

    it("should not affect other notes when deleting", () => {
      const { addNote, deleteNote } = useNotesStore.getState().actions;
      const id1 = addNote("Note 1", { x: 0, y: 0 });
      const id2 = addNote("Note 2", { x: 0, y: 0 });

      deleteNote(id1);

      expect(useNotesStore.getState().notes[id1]).toBeUndefined();
      expect(useNotesStore.getState().notes[id2]).toBeDefined();
    });
  });

  describe("selectNote", () => {
    it("should set selectedNoteId", () => {
      const { addNote, selectNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 0, y: 0 });

      selectNote(id);

      expect(useNotesStore.getState().selectedNoteId).toBe(id);
    });

    it("should allow deselecting notes", () => {
      const { addNote, selectNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 0, y: 0 });

      selectNote(id);
      selectNote(null);

      expect(useNotesStore.getState().selectedNoteId).toBeNull();
    });
  });

  describe("getNote", () => {
    it("should return note by id", () => {
      const { addNote, getNote } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 100, y: 200 });

      const note = getNote(id);

      expect(note).toBeDefined();
      expect(note!.content).toBe("Test note");
      expect(note!.position).toEqual({ x: 100, y: 200 });
    });

    it("should return undefined for non-existent note", () => {
      const { getNote } = useNotesStore.getState().actions;

      const note = getNote("non-existent-id");

      expect(note).toBeUndefined();
    });
  });

  describe("getAllNotes", () => {
    it("should return all notes as array", () => {
      const { addNote, getAllNotes } = useNotesStore.getState().actions;
      addNote("Note 1", { x: 0, y: 0 });
      addNote("Note 2", { x: 0, y: 0 });
      addNote("Note 3", { x: 0, y: 0 });

      const notes = getAllNotes();

      expect(notes).toHaveLength(3);
      expect(notes.map((n) => n.content).sort()).toEqual([
        "Note 1",
        "Note 2",
        "Note 3",
      ]);
    });

    it("should return empty array when no notes", () => {
      const { getAllNotes } = useNotesStore.getState().actions;

      const notes = getAllNotes();

      expect(notes).toEqual([]);
    });
  });

  describe("clearAllNotes", () => {
    it("should remove all notes", () => {
      const { addNote, clearAllNotes, getAllNotes } = useNotesStore.getState().actions;
      addNote("Note 1", { x: 0, y: 0 });
      addNote("Note 2", { x: 0, y: 0 });

      clearAllNotes();

      expect(getAllNotes()).toEqual([]);
    });

    it("should clear selectedNoteId", () => {
      const { addNote, selectNote, clearAllNotes } = useNotesStore.getState().actions;
      const id = addNote("Test note", { x: 0, y: 0 });

      selectNote(id);
      clearAllNotes();

      expect(useNotesStore.getState().selectedNoteId).toBeNull();
    });
  });
});
