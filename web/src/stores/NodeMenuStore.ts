/**
 * NodeMenuStore
 *
 * This module manages the state and behavior of the node selection menu in the application.
 * It handles:
 * - Opening/closing the node menu
 * - Node searching and filtering
 * - Type-based filtering
 * - Path/namespace navigation
 * - Node documentation display
 * - Connection direction for node linking
 *
 * The store uses Zustand for state management and Fuse.js for fuzzy searching.
 */

import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import useMetadataStore from "./MetadataStore";
import {
  computeSearchResults,
  filterNodesUtil,
  SearchResultGroup
} from "../utils/nodeSearch";

export interface SplitNodeDescription {
  description: string;
  tags: string[];
  useCases: {
    raw: string;
    html: string;
  };
}

export interface OpenNodeMenuParams {
  x: number;
  y: number;
  dropType?: string;
  connectDirection?: ConnectDirection;
  searchTerm?: string;
  selectedPath?: string[];
}

type NodeMenuStore = {
  isMenuOpen: boolean;
  dragToCreate: boolean;
  setDragToCreate: (dragToCreate: boolean) => void;
  connectDirection: ConnectDirection;
  setConnectDirection: (direction: ConnectDirection) => void;
  dropType: string;
  menuPosition: { x: number; y: number };
  setMenuPosition: (x: number, y: number) => void;
  menuWidth: number;
  menuHeight: number;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedInputType: string;
  setSelectedInputType: (inputType: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (outputType: string) => void;
  selectedPath: string[];
  setSelectedPath: (path: string[]) => void;
  searchResults: NodeMetadata[];
  allSearchMatches: NodeMetadata[];
  setSearchResults: (results: NodeMetadata[]) => void;
  highlightedNamespaces: string[];
  setHighlightedNamespaces: (namespaces: string[]) => void;
  hoveredNode: NodeMetadata | null;
  setHoveredNode: (node: NodeMetadata | null) => void;
  selectedNodeType: string | null;
  setSelectedNodeType: (nodeType: string | null) => void;
  documentationPosition: { x: number; y: number };
  setDocumentationPosition: (position: { x: number; y: number }) => void;
  showDocumentation: boolean;
  openDocumentation: (
    nodeType: string,
    position: { x: number; y: number }
  ) => void;
  closeDocumentation: () => void;

  clickPosition: { x: number; y: number };

  groupedSearchResults: SearchResultGroup[];

  filterNodes: (nodes: NodeMetadata[]) => NodeMetadata[];

  // Add new properties for search cancellation
  currentSearchId: number;
  setCurrentSearchId: (id: number) => void;

  // Add missing properties
  performSearch: (term: string, searchId?: number) => void;
  updateHighlightedNamespaces: (results: NodeMetadata[]) => void;
  closeNodeMenu: () => void;
  openNodeMenu: (params: OpenNodeMenuParams) => void;
  isLoading: boolean;
  searchResultsCache: Record<
    string,
    {
      sortedResults: NodeMetadata[];
      groupedResults: SearchResultGroup[];
      allMatches: NodeMetadata[];
    }
  >;
};

const useNodeMenuStore = create<NodeMenuStore>((set, get) => {
  const filterNodes = (nodes: NodeMetadata[]) =>
    filterNodesUtil(
      nodes,
      get().searchTerm,
      get().selectedPath,
      get().selectedInputType,
      get().selectedOutputType,
      get().searchResults
    );

  // Subscribe to metadata changes and clear cache
  useMetadataStore.subscribe(() => {
    set({ searchResultsCache: {} });
  });

  return {
    // menu
    isMenuOpen: false,
    dropType: "",
    dragToCreate: false,
    selectedInputType: "",
    setSelectedInputType: (inputType) => {
      set({ selectedInputType: inputType });
      get().performSearch(get().searchTerm);
    },
    selectedOutputType: "",
    setSelectedOutputType: (outputType) => {
      set({ selectedOutputType: outputType });
      get().performSearch(get().searchTerm);
    },

    setDragToCreate: (dragToCreate) => {
      set({ dragToCreate });
    },
    connectDirection: null,
    setConnectDirection: (direction) => {
      set({ connectDirection: direction as ConnectDirection });
    },
    menuPosition: { x: 0, y: 0 },
    setMenuPosition: (x, y) => {
      set({ menuPosition: { x, y } });
    },
    menuWidth: 0,
    menuHeight: 0,
    searchTerm: "",
    setSearchTerm: (term) => {
      set({
        searchTerm: term,
        selectedPath: [],
        hoveredNode: null
      });
      get().performSearch(term);
    },
    selectedPath: [],
    setSelectedPath: (path: string[]) => {
      const currentPath = get().selectedPath;
      const newPath = currentPath.join(".") === path.join(".") ? [] : path;
      const searchTerm = get().searchTerm;
      const selectedInputType = get().selectedInputType;
      const selectedOutputType = get().selectedOutputType;
      const cacheKey = JSON.stringify({
        path: newPath,
        searchTerm,
        selectedInputType,
        selectedOutputType
      });
      const cache = get().searchResultsCache;
      if (cache[cacheKey]) {
        // Use cached results immediately
        const { sortedResults, groupedResults, allMatches } = cache[cacheKey];
        set({
          selectedPath: newPath,
          searchResults: sortedResults,
          groupedSearchResults: groupedResults,
          allSearchMatches: allMatches,
          isLoading: false
        });
        get().updateHighlightedNamespaces(allMatches);
        return;
      }

      // Keep the current allSearchMatches
      const currentAllMatches = get().allSearchMatches;

      // Immediate UI update - only clear display results, keep allSearchMatches
      set({
        selectedPath: newPath,
        searchResults: [],
        groupedSearchResults: [],
        isLoading: true
      });

      // Defer expensive computation
      setTimeout(() => {
        const metadata = Object.values(useMetadataStore.getState().metadata);
        const { sortedResults, groupedResults, allMatches } =
          computeSearchResults(
            metadata,
            searchTerm,
            newPath,
            selectedInputType as TypeName,
            selectedOutputType as TypeName,
            true
          );
        // Store in cache
        set((state) => ({
          searchResults: sortedResults,
          groupedSearchResults: groupedResults,
          allSearchMatches:
            currentAllMatches.length > 0 ? currentAllMatches : allMatches,
          isLoading: false,
          searchResultsCache: {
            ...state.searchResultsCache,
            [cacheKey]: {
              sortedResults,
              groupedResults,
              allMatches:
                currentAllMatches.length > 0 ? currentAllMatches : allMatches
            }
          }
        }));
        get().updateHighlightedNamespaces(
          currentAllMatches.length > 0 ? currentAllMatches : allMatches
        );
      }, 0);
    },

    /**
     * Performs a search for nodes based on the current search criteria
     *
     * This function:
     * 1. Validates the search request against the current search ID
     * 2. Retrieves metadata
     * 3. Applies type filtering based on selected input/output types
     * 4. Performs fuzzy search using Fuse.js when a search term is provided
     * 5. Filters results based on the selected namespace path
     * 6. Sorts and groups results for display
     * 7. Updates the highlighted namespaces in the UI
     *
     * @param term - The search term to use
     * @param searchId - Optional ID to cancel outdated searches
     */
    performSearch: (term: string, searchId?: number) => {
      if (searchId !== undefined && searchId !== get().currentSearchId) {
        return;
      }

      const store = get();
      const metadata = Object.values(useMetadataStore.getState().metadata);

      if (metadata.length === 0) {
        set({ searchResults: [], highlightedNamespaces: [] });
        return;
      }

      const { sortedResults, groupedResults, allMatches } =
        computeSearchResults(
          metadata,
          term,
          store.selectedPath,
          store.selectedInputType as TypeName,
          store.selectedOutputType as TypeName,
          true
        );

      set({
        searchResults: sortedResults,
        groupedSearchResults: groupedResults,
        allSearchMatches: allMatches
      });

      store.updateHighlightedNamespaces(allMatches);
    },

    searchResults: [],
    allSearchMatches: [],
    setSearchResults: (results: NodeMetadata[]) =>
      set({ searchResults: results }),
    highlightedNamespaces: [],
    setHighlightedNamespaces: (namespaces: string[]) =>
      set({ highlightedNamespaces: namespaces }),
    hoveredNode: null,
    setHoveredNode: (node) => {
      set({ hoveredNode: node });
    },

    // DraggableNodeDocumentation
    selectedNodeType: null,
    setSelectedNodeType: (nodeType) => set({ selectedNodeType: nodeType }),
    documentationPosition: { x: 0, y: 0 },
    setDocumentationPosition: (position) =>
      set({ documentationPosition: position }),
    showDocumentation: false,
    openDocumentation: (nodeType, position) =>
      set({
        selectedNodeType: nodeType,
        documentationPosition: position,
        showDocumentation: true
      }),
    closeDocumentation: () => set({ showDocumentation: false }),

    clickPosition: { x: 0, y: 0 },

    groupedSearchResults: [],

    filterNodes,

    // Search cancellation
    currentSearchId: 0,
    setCurrentSearchId: (id) => set({ currentSearchId: id }),

    // Add missing properties
    updateHighlightedNamespaces: (results: NodeMetadata[]) => {
      const newHighlightedNamespaces = new Set<string>();
      const selectedPathString = get().selectedPath.join(".");

      // Add all search result namespaces and their parents
      results.forEach((result) => {
        const parts = result.namespace.split(".");
        let path = "";
        parts.forEach((part) => {
          path = path ? `${path}.${part}` : part;
          newHighlightedNamespaces.add(path);
        });
      });

      // Add selected path and its parents if it exists
      if (selectedPathString) {
        const selectedParts = selectedPathString.split(".");
        let path = "";
        selectedParts.forEach((part) => {
          path = path ? `${path}.${part}` : part;
          newHighlightedNamespaces.add(path);
        });
      }

      set({ highlightedNamespaces: [...newHighlightedNamespaces] });
    },
    closeNodeMenu: () => {
      if (get().isMenuOpen) {
        if (get().dragToCreate) {
          set({ dragToCreate: false });
          return;
        }
        set({
          searchTerm: "",
          dropType: "",
          dragToCreate: false,
          connectDirection: null,
          isMenuOpen: false,
          menuPosition: { x: 100, y: 100 },
          searchResults: [],
          groupedSearchResults: [],
          selectedPath: [],
          highlightedNamespaces: [],
          selectedInputType: "",
          selectedOutputType: "",
          showDocumentation: false,
          selectedNodeType: null
        });
      }
    },
    openNodeMenu: (params: OpenNodeMenuParams) => {
      set({ clickPosition: { x: params.x, y: params.y } });
      const { menuWidth, menuHeight } = get();

      // --- Configuration ---
      // There's a CSS/layout offset that gets added to our component's final Y position
      const Y_OFFSET_COMPENSATION = 60; // Reduced from 120 for better MacBook compatibility
      // Fallback dimensions for the first render when the actual dimensions are 0
      const FALLBACK_MENU_WIDTH = 800;
      const FALLBACK_MENU_HEIGHT = 700; // Reduced from 870 for MacBook screens
      // Padding from the window edge when the menu is forced to move
      const WINDOW_EDGE_OFFSET_X = 10;
      const WINDOW_EDGE_OFFSET_Y = 60 + 10; // Increased padding for macOS menu bar

      // --- Calculation ---
      const actualMenuWidth = menuWidth > 0 ? menuWidth : FALLBACK_MENU_WIDTH;
      const actualMenuHeight =
        menuHeight > 0 ? menuHeight : FALLBACK_MENU_HEIGHT;

      // 1. Start with the desired visual position at the mouse cursor
      let visualX = params.x;
      let visualY = params.y;

      // 2. Check if the menu overflows the window edges and adjust
      // Adjust X if it overflows the right edge
      if (visualX + actualMenuWidth > window.innerWidth) {
        visualX = window.innerWidth - actualMenuWidth - WINDOW_EDGE_OFFSET_X;
      }
      // Adjust Y if it overflows the bottom edge
      if (visualY + actualMenuHeight > window.innerHeight) {
        visualY = window.innerHeight - actualMenuHeight - WINDOW_EDGE_OFFSET_Y;
      }

      // 3. Ensure the final position is not negative and account for macOS menu bar
      visualX = Math.max(WINDOW_EDGE_OFFSET_X, visualX);
      visualY = Math.max(WINDOW_EDGE_OFFSET_Y, visualY);

      // 4. Apply the Y-offset compensation to get the final value for the component
      const finalX = visualX;
      const finalY = visualY - Y_OFFSET_COMPENSATION;

      // Determine if search params have changed
      const searchParamsChanged =
        (params.searchTerm !== undefined &&
          params.searchTerm !== get().searchTerm) ||
        (params.dropType &&
          params.connectDirection === "target" &&
          params.dropType !== get().selectedInputType) ||
        (params.dropType &&
          params.connectDirection === "source" &&
          params.dropType !== get().selectedOutputType) ||
        (params.selectedPath &&
          params.selectedPath.join(".") !== get().selectedPath.join("."));

      set({
        isMenuOpen: true,
        searchTerm: params.searchTerm || "",
        menuPosition: { x: finalX, y: finalY },
        dropType: params.dropType || "",
        connectDirection: params.connectDirection || null,
        selectedPath: params.selectedPath || [],
        selectedInputType:
          params.dropType && params.connectDirection === "target"
            ? params.dropType
            : "",
        selectedOutputType:
          params.dropType && params.connectDirection === "source"
            ? params.dropType
            : "",
        menuWidth: 800,
        menuHeight: 700
      });

      // Only perform search if any search-related params changed
      if (searchParamsChanged) {
        setTimeout(() => {
          get().performSearch(params.searchTerm || "");
        }, 0);
      }
    },
    isLoading: false,
    searchResultsCache: {}
  };
});

export default useNodeMenuStore;
