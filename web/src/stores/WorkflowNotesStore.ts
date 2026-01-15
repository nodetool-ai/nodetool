import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface WorkflowNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNotes {
  workflowId: string;
  notes: WorkflowNote[];
}

interface WorkflowNotesState {
  notesByWorkflow: Record<string, WorkflowNote[]>;
  activeWorkflowId: string | null;
  setActiveWorkflowId: (workflowId: string | null) => void;
  getNotes: (workflowId: string) => WorkflowNote[];
  addNote: (workflowId: string, content: string) => void;
  updateNote: (workflowId: string, noteId: string, content: string) => void;
  deleteNote: (workflowId: string, noteId: string) => void;
  clearNotes: (workflowId: string) => void;
}

const STORAGE_KEY = "workflow_notes";

const loadNotesFromStorage = (): Record<string, WorkflowNote[]> => {
  try {
    if (typeof window === "undefined") {
      return {};
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn("Failed to load workflow notes from storage:", error);
  }
  return {};
};

const saveNotesToStorage = (notes: Record<string, WorkflowNote[]>): void => {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }
  } catch (error) {
    console.warn("Failed to save workflow notes to storage:", error);
  }
};

export const useWorkflowNotesStore = create<WorkflowNotesState>()(
  persist(
    (set, get) => ({
      notesByWorkflow: {},
      activeWorkflowId: null,

      setActiveWorkflowId: (workflowId: string | null) => {
        set({ activeWorkflowId: workflowId });
      },

      getNotes: (workflowId: string) => {
        const state = get();
        return state.notesByWorkflow[workflowId] || [];
      },

      addNote: (workflowId: string, content: string) => {
        const state = get();
        const currentNotes = state.notesByWorkflow[workflowId] || [];
        const newNote: WorkflowNote = {
          id: crypto.randomUUID(),
          content: content.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const updatedNotes = [...currentNotes, newNote];
        const newNotesByWorkflow = {
          ...state.notesByWorkflow,
          [workflowId]: updatedNotes
        };
        set({ notesByWorkflow: newNotesByWorkflow });
        saveNotesToStorage(newNotesByWorkflow);
      },

      updateNote: (workflowId: string, noteId: string, content: string) => {
        const state = get();
        const currentNotes = state.notesByWorkflow[workflowId];
        if (!currentNotes) {
          return;
        }
        const updatedNotes = currentNotes.map((note) =>
          note.id === noteId
            ? { ...note, content: content.trim(), updatedAt: new Date().toISOString() }
            : note
        );
        const newNotesByWorkflow = {
          ...state.notesByWorkflow,
          [workflowId]: updatedNotes
        };
        set({ notesByWorkflow: newNotesByWorkflow });
        saveNotesToStorage(newNotesByWorkflow);
      },

      deleteNote: (workflowId: string, noteId: string) => {
        const state = get();
        const currentNotes = state.notesByWorkflow[workflowId];
        if (!currentNotes) {
          return;
        }
        const updatedNotes = currentNotes.filter((note) => note.id !== noteId);
        const newNotesByWorkflow = {
          ...state.notesByWorkflow,
          [workflowId]: updatedNotes
        };
        set({ notesByWorkflow: newNotesByWorkflow });
        saveNotesToStorage(newNotesByWorkflow);
      },

      clearNotes: (workflowId: string) => {
        const state = get();
        const newNotesByWorkflow = { ...state.notesByWorkflow };
        delete newNotesByWorkflow[workflowId];
        set({ notesByWorkflow: newNotesByWorkflow });
        saveNotesToStorage(newNotesByWorkflow);
      }
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ notesByWorkflow: state.notesByWorkflow })
    }
  )
);
