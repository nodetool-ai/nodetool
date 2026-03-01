/**
 * NodeMenuStore manages the state and behavior of the node selection menu.
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
  centerOnScreen?: boolean;
}

export type ProviderFilterType = "all" | "api" | "local";

export type NodeMenuStore = {
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
  setMenuSize: (width: number, height: number) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedInputType: string;
  setSelectedInputType: (inputType: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (outputType: string) => void;
  selectedProviderType: ProviderFilterType;
  setSelectedProviderType: (providerType: ProviderFilterType) => void;
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
  // Guard to prevent immediate close right after open
  closeBlockUntil: number;

  // Keyboard navigation for search results
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  moveSelectionUp: () => void;
  moveSelectionDown: () => void;
  getSelectedNode: () => NodeMetadata | null;
};

type NodeMenuStoreOptions = {
  onlyTools?: boolean;
};

export const createNodeMenuStore = (options: NodeMenuStoreOptions = {}) =>
  create<NodeMenuStore>((set, get) => {
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingSearchId = 0;

    const getFilteredMetadata = () => {
      const all = Object.values(useMetadataStore.getState().metadata);
      return options.onlyTools ? all.filter((n) => n.expose_as_tool) : all;
    };
    const filterNodes = (nodes: NodeMetadata[]) =>
      filterNodesUtil(
        nodes,
        get().searchTerm,
        get().selectedPath,
        get().selectedInputType,
        get().selectedOutputType,
        get().searchResults,
        get().selectedProviderType
      );

    // Optimized search scheduling - no synchronous isLoading update
    const scheduleSearch = (term: string) => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      const nextSearchId = ++pendingSearchId;
      // Don't set isLoading synchronously - it causes unnecessary re-renders
      // The search is fast enough that isLoading state isn't needed for short debounces
      searchTimeout = setTimeout(() => {
        searchTimeout = null;
        // Only proceed if this is still the latest search request
        if (nextSearchId === pendingSearchId) {
          get().performSearch(term, nextSearchId);
        }
      }, 50); // Reduced from 75ms since SearchInput already debounces
    };

    // Subscribe to metadata changes and clear cache
    useMetadataStore.subscribe(() => {
      set({ searchResultsCache: {} });
      if (get().isMenuOpen) {
        scheduleSearch(get().searchTerm);
      }
    });

    return {
      // menu
      isMenuOpen: false,
      closeBlockUntil: 0,
      dropType: "",
      dragToCreate: false,
      selectedInputType: "",
      setSelectedInputType: (inputType) => {
        const current = get().selectedInputType;
        if (current !== inputType) {
          set({ selectedInputType: inputType });
          scheduleSearch(get().searchTerm);
        }
      },
      selectedOutputType: "",
      setSelectedOutputType: (outputType) => {
        const current = get().selectedOutputType;
        if (current !== outputType) {
          set({ selectedOutputType: outputType });
          scheduleSearch(get().searchTerm);
        }
      },
      selectedProviderType: "all",
      setSelectedProviderType: (providerType) => {
        const current = get().selectedProviderType;
        if (current !== providerType) {
          set({ selectedProviderType: providerType });
          scheduleSearch(get().searchTerm);
        }
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
      setMenuSize: (width, height) =>
        set({ menuWidth: width, menuHeight: height }),
      searchTerm: "",
      setSearchTerm: (term) => {
        // Only update searchTerm - avoid unnecessary state changes
        // Don't clear hoveredNode here as it causes extra re-renders
        const currentTerm = get().searchTerm;
        if (currentTerm !== term) {
          // Reset keyboard selection when search term changes
          set({ searchTerm: term, selectedIndex: -1 });
        }
        // Run debounced search with the provided term
        scheduleSearch(term);
      },
      selectedPath: [],
      setSelectedPath: (path: string[]) => {
        // Always set the provided path; do not toggle to empty on re-select.
        // Use the explicit "All" control to clear the selection.
        const newPath = path;
        const searchTerm = get().searchTerm;
        const selectedInputType = get().selectedInputType;
        const selectedOutputType = get().selectedOutputType;
        const selectedProviderType = get().selectedProviderType;
        const cacheKey = JSON.stringify({
          path: newPath,
          searchTerm,
          selectedInputType,
          selectedOutputType,
          selectedProviderType
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

        const metadata = getFilteredMetadata();
        const { sortedResults, groupedResults, allMatches } =
          computeSearchResults(
            metadata,
            searchTerm,
            newPath,
            selectedInputType as TypeName,
            selectedOutputType as TypeName,
            true,
            selectedProviderType
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
        // Check against the local pendingSearchId to detect stale requests
        // Note: searchId comes from scheduleSearch which uses pendingSearchId
        if (searchId !== undefined && searchId !== pendingSearchId) {
          return;
        }

        const store = get();
        const metadata = getFilteredMetadata();

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
            true,
            store.selectedProviderType
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
            selectedProviderType: "all",
            showDocumentation: false,
            selectedNodeType: null,
            selectedIndex: -1
          });
        }
      },
      openNodeMenu: (params: OpenNodeMenuParams) => {
        set({ clickPosition: { x: params.x, y: params.y } });
        const { menuWidth, menuHeight } = get();

        // --- Configuration ---
        // Fallback dimensions for the first render when the actual dimensions are 0
        const FALLBACK_MENU_WIDTH = 950;
        const FALLBACK_MENU_HEIGHT = 900;
        // Padding from the window edge when the menu is forced to move
        const WINDOW_EDGE_OFFSET_X = 10;
        const WINDOW_EDGE_OFFSET_TOP = 10;
        const WINDOW_EDGE_OFFSET_BOTTOM = 80; // reserve space for bottom UI/safe area
        // Slight anchor so the header appears closer to the cursor
        const CURSOR_ANCHOR_OFFSET_Y = 40;

        // --- Calculation ---
        const actualMenuWidth =
          menuWidth && menuWidth > 0 ? menuWidth : FALLBACK_MENU_WIDTH;
        const actualMenuHeight =
          menuHeight && menuHeight > 0 ? menuHeight : FALLBACK_MENU_HEIGHT;

        // Calculate position based on whether we should center on screen
        let visualX: number;
        let visualY: number;

        if (params.centerOnScreen) {
          // Center the menu on the screen
          visualX = (window.innerWidth - actualMenuWidth) / 2;
          visualY = (window.innerHeight - actualMenuHeight) / 2;
        } else {
          // Start with the desired visual position at the mouse cursor
          visualX = params.x;
          visualY = params.y - CURSOR_ANCHOR_OFFSET_Y;
        }

        // 2. Check if the menu overflows the window edges and adjust
        // Adjust X if it overflows the right edge
        if (visualX + actualMenuWidth > window.innerWidth) {
          visualX = window.innerWidth - actualMenuWidth - WINDOW_EDGE_OFFSET_X;
        }
        // Adjust Y if it overflows the bottom edge
        if (visualY + actualMenuHeight > window.innerHeight) {
          visualY =
            window.innerHeight - actualMenuHeight - WINDOW_EDGE_OFFSET_BOTTOM;
        }

        // 3. Ensure the final position is not negative and account for macOS menu bar
        visualX = Math.max(WINDOW_EDGE_OFFSET_X, visualX);
        visualY = Math.max(WINDOW_EDGE_OFFSET_TOP, visualY);

        // 4. Final values applied to the component
        const finalX = visualX;
        const finalY = visualY;

        // Determine if we should run search immediately on open
        // Always run if a searchTerm is provided (even if unchanged), or if filters changed
        const shouldSearchOnOpen =
          params.searchTerm !== undefined ||
          (params.dropType &&
            params.connectDirection === "target" &&
            params.dropType !== get().selectedInputType) ||
          (params.dropType &&
            params.connectDirection === "source" &&
            params.dropType !== get().selectedOutputType) ||
          (params.selectedPath &&
            params.selectedPath.join(".") !== get().selectedPath.join("."));

        const initialSelectedPath = params.searchTerm
          ? []
          : params.selectedPath || [];
        set({
          isMenuOpen: true,
          // ensure these are set before running the search
          searchTerm: params.searchTerm || "",
          selectedPath: initialSelectedPath,
          menuPosition: { x: finalX, y: finalY },
          dropType: params.dropType || "",
          connectDirection: params.connectDirection || null,
          selectedInputType:
            params.dropType && params.connectDirection === "target"
              ? params.dropType
              : "",
          selectedOutputType:
            params.dropType && params.connectDirection === "source"
              ? params.dropType
              : "",
          selectedProviderType: "all",
          menuWidth: 950,
          menuHeight: 900
        });

        // Perform search when opening if needed
        if (shouldSearchOnOpen) {
          const term = params.searchTerm || "";
          scheduleSearch(term);
        }
      },
      isLoading: false,
      searchResultsCache: {},

      // Keyboard navigation for search results
      selectedIndex: -1,
      setSelectedIndex: (index: number) => set({ selectedIndex: index }),
      moveSelectionUp: () => {
        const { selectedIndex, groupedSearchResults } = get();
        const allNodes = groupedSearchResults.flatMap((g) => g.nodes);
        if (allNodes.length === 0) { return; }
        const newIndex = selectedIndex <= 0 ? allNodes.length - 1 : selectedIndex - 1;
        set({ selectedIndex: newIndex });
      },
      moveSelectionDown: () => {
        const { selectedIndex, groupedSearchResults } = get();
        const allNodes = groupedSearchResults.flatMap((g) => g.nodes);
        if (allNodes.length === 0) { return; }
        const newIndex = selectedIndex >= allNodes.length - 1 ? 0 : selectedIndex + 1;
        set({ selectedIndex: newIndex });
      },
      getSelectedNode: () => {
        const { selectedIndex, groupedSearchResults } = get();
        const allNodes = groupedSearchResults.flatMap((g) => g.nodes);
        if (selectedIndex < 0 || selectedIndex >= allNodes.length) { return null; }
        return allNodes[selectedIndex];
      }
    };
  });

export const useNodeMenuStore = createNodeMenuStore();
export const useNodeToolsMenuStore = createNodeMenuStore({ onlyTools: true });

export const __setNodeToolsMenuStore = (
  state: Partial<NodeMenuStore>,
  replace?: boolean
) => {
  useNodeToolsMenuStore.setState(state, replace);
};

export default useNodeMenuStore;
