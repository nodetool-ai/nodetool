/**
 * QuickAddNodeStore manages the state and behavior of the Quick Add Node dialog.
 *
 * The Quick Add Node dialog provides a fast, keyboard-accessible way to search
 * and add nodes to the workflow from anywhere in the editor, similar to VS Code's
 * Command Palette but specifically for node creation.
 *
 * @example
 * ```typescript
 * // Use selective Zustand selectors to prevent unnecessary re-renders
 * const isOpen = useQuickAddNodeStore((state) => state.isOpen);
 * const openDialog = useQuickAddNodeStore((state) => state.openDialog);
 * const closeDialog = useQuickAddNodeStore((state) => state.closeDialog);
 * const searchTerm = useQuickAddNodeStore((state) => state.searchTerm);
 * ```
 */

import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";
import useMetadataStore from "./MetadataStore";

export interface QuickAddNodeState {
  /** Whether the Quick Add Node dialog is currently open */
  isOpen: boolean;
  /** Current search term in the dialog */
  searchTerm: string;
  /** Filtered search results based on search term and filters */
  searchResults: NodeMetadata[];
  /** Currently selected result index for keyboard navigation */
  selectedIndex: number;
  /** Selected input type filter */
  selectedInputType: string;
  /** Selected output type filter */
  selectedOutputType: string;
  /** Optional position where node should be placed */
  position?: { x: number; y: number };

  // Actions
  /** Open the Quick Add Node dialog with optional initial position */
  openDialog: (params?: { x?: number; y?: number }) => void;
  /** Close the Quick Add Node dialog */
  closeDialog: () => void;
  /** Update the search term and filter results */
  setSearchTerm: (term: string) => void;
  /** Set the selected input type filter */
  setSelectedInputType: (inputType: string) => void;
  /** Set the selected output type filter */
  setSelectedOutputType: (outputType: string) => void;
  /** Set the selected index */
  setSelectedIndex: (index: number) => void;
  /** Move selection up in the results list */
  moveSelectionUp: () => void;
  /** Move selection down in the results list */
  moveSelectionDown: () => void;
  /** Get the currently selected node metadata */
  getSelectedNode: () => NodeMetadata | null;
  /** Reset all filters and search state */
  resetFilters: () => void;
  /** Set the position where the node should be placed */
  setPosition: (position: { x: number; y: number }) => void;
}

/**
 * Creates a Zustand store for managing the Quick Add Node dialog state.
 *
 * The store handles:
 * - Dialog open/close state
 * - Search term management with debounced filtering
 * - Input/output type filtering
 * - Keyboard navigation through results
 * - Metadata-based node search
 */
const useQuickAddNodeStore = create<QuickAddNodeState>((set, get) => {
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Filters nodes based on search term.
   */
  const filterNodes = (term: string): NodeMetadata[] => {
    const metadata = useMetadataStore.getState().metadata;
    const allNodes = Object.values(metadata);

    if (!term.trim()) {
      // Return all nodes if no filters applied
      return allNodes;
    }

    const normalizedTerm = term.toLowerCase().trim();

    return allNodes.filter((node) => {
      // Search term matching against title and node_type
      return (
        node.title?.toLowerCase().includes(normalizedTerm) ||
        node.node_type?.toLowerCase().includes(normalizedTerm) ||
        node.namespace?.toLowerCase().includes(normalizedTerm)
      );
    });
  };

  /**
   * Debounced search function to filter nodes based on current state.
   */
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
      // Clear any pending search
      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }
    },

    setSearchTerm: (term: string) => {
      set({ searchTerm: term });

      // Debounce search for better performance
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
