/**
 * QuickAddNodeStore manages the state and behavior of the Quick Add Node dialog.
 *
 * The Quick Add Node dialog provides a fast, keyboard-accessible way to search
 * and add nodes to the workflow from anywhere in the editor, similar to VS Code's
 * Command Palette but specifically for node creation.
 */

import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import useMetadataStore from "./MetadataStore";

interface QuickAddNodeState {
  isOpen: boolean;
  searchTerm: string;
  searchResults: NodeMetadata[];
  /** Currently selected result index for keyboard navigation */
  selectedIndex: number;
  selectedInputType: TypeName;
  selectedOutputType: TypeName;
  /** Position where the node should be placed */
  position?: { x: number; y: number };

  openDialog: (params?: { x?: number; y?: number }) => void;
  closeDialog: () => void;
  setSearchTerm: (term: string) => void;
  setSelectedInputType: (inputType: TypeName) => void;
  setSelectedOutputType: (outputType: TypeName) => void;
  setSelectedIndex: (index: number) => void;
  moveSelectionUp: () => void;
  moveSelectionDown: () => void;
  getSelectedNode: () => NodeMetadata | null;
  resetFilters: () => void;
  setPosition: (position: { x: number; y: number }) => void;
}

const useQuickAddNodeStore = create<QuickAddNodeState>((set, get) => {
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  const filterNodes = (term: string): NodeMetadata[] => {
    const metadata = useMetadataStore.getState().metadata;
    const allNodes = Object.values(metadata);

    if (!term.trim()) {
      return allNodes;
    }

    const normalizedTerm = term.toLowerCase().trim();

    return allNodes.filter((node) => {
      return (
        node.title?.toLowerCase().includes(normalizedTerm) ||
        node.node_type?.toLowerCase().includes(normalizedTerm) ||
        node.namespace?.toLowerCase().includes(normalizedTerm)
      );
    });
  };

  const performSearch = (term: string) => {
    const results = filterNodes(term);
    set({ searchResults: results, selectedIndex: -1 });
  };

  return {
    isOpen: false,
    searchTerm: "",
    searchResults: [],
    selectedIndex: -1,
    selectedInputType: "",
    selectedOutputType: "",

    openDialog: (params) => {
      set({
        isOpen: true,
        searchTerm: "",
        searchResults: [],
        selectedIndex: -1,
        selectedInputType: "",
        selectedOutputType: "",
        position: params ? { x: params.x ?? 0, y: params.y ?? 0 } : undefined
      });
    },

    closeDialog: () => {
      set({
        isOpen: false,
        searchTerm: "",
        searchResults: [],
        selectedIndex: -1,
        position: undefined
      });
      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }
    },

    setSearchTerm: (term: string) => {
      set({ searchTerm: term });

      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      searchTimeout = setTimeout(() => {
        performSearch(term);
      }, 100);
    },

    setSelectedInputType: (_inputType: string) => {
      // Type filtering not implemented in initial version
      // kept for future extensibility
    },

    setSelectedOutputType: (_outputType: string) => {
      // Type filtering not implemented in initial version
      // kept for future extensibility
    },

    setSelectedIndex: (index: number) => {
      set({ selectedIndex: index });
    },

    moveSelectionUp: () => {
      const { searchResults, selectedIndex } = get();
      if (searchResults.length === 0) {return;}

      const newIndex =
        selectedIndex <= 0 ? searchResults.length - 1 : selectedIndex - 1;
      set({ selectedIndex: newIndex });
    },

    moveSelectionDown: () => {
      const { searchResults, selectedIndex } = get();
      if (searchResults.length === 0) {return;}

      const newIndex =
        selectedIndex >= searchResults.length - 1 ? 0 : selectedIndex + 1;
      set({ selectedIndex: newIndex });
    },

    getSelectedNode: () => {
      const { searchResults, selectedIndex } = get();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        return searchResults[selectedIndex];
      }
      return null;
    },

    resetFilters: () => {
      set({
        searchTerm: "",
        selectedInputType: "",
        selectedOutputType: ""
      });
      performSearch("");
    },

    setPosition: (position: { x: number; y: number }) => {
      set({ position });
    }
  };
});

export default useQuickAddNodeStore;
