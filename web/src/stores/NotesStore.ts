import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uuidv4 } from "./uuidv4";

export interface NoteData {
  id: string;
  content: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotesState {
  notes: Record<string, NoteData>;
  selectedNoteId: string | null;

  actions: {
    addNote: (
      content: string,
      position: { x: number; y: number },
      color?: string
    ) => string;
    updateNote: (id: string, updates: Partial<Omit<NoteData, "id" | "createdAt">>) => void;
    deleteNote: (id: string) => void;
    selectNote: (id: string | null) => void;
    getNote: (id: string) => NoteData | undefined;
    getAllNotes: () => NoteData[];
    clearAllNotes: () => void;
  };
}

const defaultNoteColors = [
  "#fef3c7", // yellow
  "#dbeafe", // blue
  "#dcfce7", // green
  "#fce7f3", // pink
  "#f3e8ff", // purple
  "#ffedd5", // orange
];

const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: {},
      selectedNoteId: null,

      actions: {
        addNote: (content: string, position: { x: number; y: number }, color?: string) => {
          const id = uuidv4();
          const now = Date.now();
          const note: NoteData = {
            id,
            content,
            position,
            width: 200,
            height: 150,
            color: color || defaultNoteColors[Math.floor(Math.random() * defaultNoteColors.length)],
            createdAt: now,
            updatedAt: now,
          };

          set((state) => ({
            notes: {
              ...state.notes,
              [id]: note,
            },
          }));

          return id;
        },

        updateNote: (id: string, updates: Partial<Omit<NoteData, "id" | "createdAt">>) => {
          set((state) => {
            const existingNote = state.notes[id];
            if (!existingNote) {
              return state;
            }

            return {
              notes: {
                ...state.notes,
                [id]: {
                  ...existingNote,
                  ...updates,
                  updatedAt: Date.now(),
                },
              },
            };
          });
        },

        deleteNote: (id: string) => {
          set((state) => {
            const { [id]: removed, ...remainingNotes } = state.notes;
            return {
              notes: remainingNotes,
              selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
            };
          });
        },

        selectNote: (id: string | null) => {
          set({ selectedNoteId: id });
        },

        getNote: (id: string) => {
          return get().notes[id];
        },

        getAllNotes: () => {
          return Object.values(get().notes);
        },

        clearAllNotes: () => {
          set({ notes: {}, selectedNoteId: null });
        },
      },
    }),
    {
      name: "notes-store",
      partialize: (state) => ({ notes: state.notes }),
    }
  )
);

export const useNotes = () => useNotesStore((state) => state.notes);
export const useSelectedNoteId = () =>
  useNotesStore((state) => state.selectedNoteId);
export const useNotesActions = () =>
  useNotesStore((state) => state.actions);

export default useNotesStore;
