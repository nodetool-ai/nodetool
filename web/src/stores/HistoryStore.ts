import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HistoryEntry {
  id: string;
  timestamp: number;
  actionType: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
}

interface HistoryState {
  isOpen: boolean;
  entries: HistoryEntry[];
  selectedEntryId: string | null;
  setIsOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
  addEntry: (entry: Omit<HistoryEntry, "id" | "timestamp">) => void;
  clearEntries: () => void;
  setSelectedEntry: (entryId: string | null) => void;
}

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const MAX_ENTRIES = 50;

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, _get) => ({
      isOpen: false,
      entries: [],
      selectedEntryId: null,

      setIsOpen: (isOpen: boolean) =>
        set({ isOpen }),

      toggleOpen: () =>
        set((state) => ({ isOpen: !state.isOpen })),

      addEntry: (entry) =>
        set((state) => {
          const newEntry: HistoryEntry = {
            ...entry,
            id: generateId(),
            timestamp: Date.now()
          };
          const newEntries = [newEntry, ...state.entries].slice(0, MAX_ENTRIES);
          return { entries: newEntries };
        }),

      clearEntries: () =>
        set({ entries: [], selectedEntryId: null }),

      setSelectedEntry: (entryId) =>
        set({ selectedEntryId: entryId })
    }),
    {
      name: "history-panel-storage",
      partialize: (state) => ({
        isOpen: state.isOpen
      })
    }
  )
);
