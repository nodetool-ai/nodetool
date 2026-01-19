/**
 * Manages the "Find in Workflow" search functionality.
 *
 * Provides keyboard-driven search through all nodes in the current workflow.
 * Supports searching by node name, type, properties, and displays results
 * with navigation between matches. Integrates with keyboard shortcuts
 * (Ctrl/Cmd+F) for quick access.
 *
 * Features:
 * - Real-time search as you type
 * - Multiple match highlighting
 * - Keyboard navigation (Enter, Shift+Enter, Esc)
 * - Results count display
 * - Clears search on close
 *
 * @example
 * ```typescript
 * import { useFindInWorkflowStore } from './FindInWorkflowStore';
 *
 * const store = useFindInWorkflowStore();
 * store.openFind();
 * store.setSearchTerm('image');
 * store.navigateNext();
 * ```
 */
import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface FindResult {
  node: Node<NodeData>;
  matchIndex: number;
}

interface FindInWorkflowState {
  isOpen: boolean;
  searchTerm: string;
  results: FindResult[];
  selectedIndex: number;

  openFind: () => void;
  closeFind: () => void;
  setSearchTerm: (term: string) => void;
  setResults: (results: FindResult[]) => void;
  setSelectedIndex: (index: number) => void;
  navigateNext: () => void;
  navigatePrevious: () => void;
  clearSearch: () => void;
}

export const useFindInWorkflowStore = create<FindInWorkflowState>((set, get) => ({
  isOpen: false,
  searchTerm: "",
  results: [],
  selectedIndex: 0,

  openFind: () => set({ isOpen: true, searchTerm: "", results: [], selectedIndex: 0 }),
  closeFind: () => set({ isOpen: false, searchTerm: "", results: [], selectedIndex: 0 }),
  setSearchTerm: (searchTerm: string) => set({ searchTerm }),
  setResults: (results: FindResult[]) =>
    set({ results, selectedIndex: results.length > 0 ? 0 : -1 }),
  setSelectedIndex: (selectedIndex: number) => set({ selectedIndex }),
  navigateNext: () => {
    const { results, selectedIndex } = get();
    if (results.length === 0) {
      return;
    }
    const newIndex = selectedIndex < results.length - 1 ? selectedIndex + 1 : 0;
    set({ selectedIndex: newIndex });
  },
  navigatePrevious: () => {
    const { results, selectedIndex } = get();
    if (results.length === 0) {
      return;
    }
    const newIndex = selectedIndex > 0 ? selectedIndex - 1 : results.length - 1;
    set({ selectedIndex: newIndex });
  },
  clearSearch: () => set({ searchTerm: "", results: [], selectedIndex: 0 })
}));
