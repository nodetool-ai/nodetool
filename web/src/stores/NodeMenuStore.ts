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
import Fuse, { IFuseOptions } from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";
import useRemoteSettingsStore from "./RemoteSettingStore";
import { formatNodeDocumentation } from "./formatNodeDocumentation";
import { fuseOptions, ExtendedFuseOptions } from "./fuseOptions";
import { useSettingsStore } from "./SettingsStore";

export interface SplitNodeDescription {
  description: string;
  tags: string[];
  useCases: {
    raw: string;
    html: string;
  };
}

export type SearchResultGroup = {
  title: string;
  nodes: NodeMetadata[];
};

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
  selectedInputType: string;
  setSelectedInputType: (inputType: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (outputType: string) => void;
  setSearchTerm: (term: string) => void;
  selectedPath: string[];
  setSelectedPath: (path: string[]) => void;
  performSearch: (term: string, searchId?: number) => void;
  updateHighlightedNamespaces: (results: NodeMetadata[]) => void;
  openNodeMenu: (params: OpenNodeMenuParams) => void;
  closeNodeMenu: () => void;
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
};

const useNodeMenuStore = create<NodeMenuStore>((set, get) => {
  const shouldFilterByApiKey = (term: string, store: NodeMenuStore) => {
    return term.trim() || store.selectedInputType || store.selectedOutputType;
  };

  const isNodeApiKeyMissing = (node: NodeMetadata, secrets: any) => {
    const rootNamespace = node.namespace.split(".")[0];
    const isComfyEnabled = useSettingsStore.getState().settings.enableComfy;

    switch (rootNamespace) {
      case "comfy":
        return !isComfyEnabled;
      case "openai":
        return !secrets.OPENAI_API_KEY || secrets.OPENAI_API_KEY.trim() === "";
      case "replicate":
        return (
          !secrets.REPLICATE_API_TOKEN ||
          secrets.REPLICATE_API_TOKEN.trim() === ""
        );
      case "anthropic":
        return (
          !secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY.trim() === ""
        );
      case "elevenlabs":
        return (
          !secrets.ELEVENLABS_API_KEY ||
          secrets.ELEVENLABS_API_KEY.trim() === ""
        );
      case "fal":
        return !secrets.FAL_API_KEY || secrets.FAL_API_KEY.trim() === "";
      case "aime":
        return (
          !secrets.AIME_API_KEY ||
          secrets.AIME_API_KEY.trim() === "" ||
          !secrets.AIME_USER ||
          secrets.AIME_USER.trim() === ""
        );
      default:
        return false;
    }
  };

  const performGroupedSearch = (entries: any[], term: string) => {
    // Title matches
    const titleFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 3,
      minMatchCharLength: 2,
      keys: [{ name: "title", weight: 1.0 }]
    });

    // Title + tags matches
    const titleTagsFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 2,
      minMatchCharLength: 1,
      keys: [
        { name: "namespace", weight: 0.8 },
        { name: "tags", weight: 0.6 }
      ]
    });

    // Description matches
    const descriptionFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.29,
      distance: 100,
      minMatchCharLength: 3,
      keys: [
        { name: "description", weight: 0.95 },
        { name: "use_cases", weight: 0.9 }
      ],
      tokenize: true,
      tokenSeparator: /[\s.,\-_]+/,
      findAllMatches: true,
      ignoreLocation: true,
      includeMatches: true,
      useExtendedSearch: true
    } as ExtendedFuseOptions<any>);

    const titleResults = titleFuse.search(term).map((result) => ({
      ...result.item.metadata,
      searchInfo: {
        score: result.score,
        matches: result.matches
      }
    }));

    const titleTagsResults = titleTagsFuse
      .search(term)
      .filter(
        (result) =>
          !titleResults.some(
            (r) => r.node_type === result.item.metadata.node_type
          )
      )
      .map((result) => ({
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
        }
      }));

    // Search with original term and with spaces removed
    const termNoSpaces = term.replace(/\s+/g, "");
    const results = new Map();

    // Collect all results, keeping only one match per position
    [
      ...descriptionFuse.search(term),
      ...descriptionFuse.search(termNoSpaces)
    ].forEach((result) => {
      const nodeType = result.item.metadata.node_type;
      if (!results.has(nodeType)) {
        results.set(nodeType, result);
      }
    });

    const descriptionResults = Array.from(results.values())
      .filter(
        (result) =>
          !titleResults.some(
            (r) => r.node_type === result.item.metadata.node_type
          ) &&
          !titleTagsResults.some(
            (r) => r.node_type === result.item.metadata.node_type
          )
      )
      .map((result) => ({
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
        }
      }));

    return [
      {
        title: "Name",
        nodes: titleResults
      },
      {
        title: "Namespace + Tags",
        nodes: titleTagsResults
      },
      {
        title: "Description",
        nodes: descriptionResults
      }
    ].filter((group) => group.nodes.length > 0);
  };

  const filterNodes = (nodes: NodeMetadata[]) => {
    if (!nodes) return [];

    const searchTerm = get().searchTerm;
    const selectedPathString = get().selectedPath.join(".");
    const selectedInputType = get().selectedInputType;
    const selectedOutputType = get().selectedOutputType;

    const minSearchTermLength =
      searchTerm.includes("+") ||
      searchTerm.includes("-") ||
      searchTerm.includes("*") ||
      searchTerm.includes("/")
        ? 0
        : 1;

    let filteredNodes = undefined;

    // When searching or filtering by types, show all matching nodes
    if (
      searchTerm.length > minSearchTermLength ||
      selectedInputType ||
      selectedOutputType
    ) {
      filteredNodes = nodes.filter((node) => {
        return get().searchResults.some(
          (result) =>
            result.title === node.title && result.namespace === node.namespace
        );
      });
    } else {
      // Otherwise filter by namespace selection
      filteredNodes = nodes.filter((node) => {
        const isExactMatch = node.namespace === selectedPathString;
        const isDirectChild =
          node.namespace.startsWith(selectedPathString + ".") &&
          node.namespace.split(".").length ===
            selectedPathString.split(".").length + 1;
        const isRootNamespace = !selectedPathString.includes(".");
        const isDescendant = node.namespace.startsWith(
          selectedPathString + "."
        );

        return (
          isExactMatch || isDirectChild || (isRootNamespace && isDescendant)
        );
      });
    }

    return filteredNodes.sort((a, b) => {
      const namespaceComparison = a.namespace.localeCompare(b.namespace);
      return namespaceComparison !== 0
        ? namespaceComparison
        : a.title.localeCompare(b.title);
    });
  };

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
    menuWidth: 900,
    menuHeight: 800,
    setMenuPosition: (x, y) => {
      set({
        menuPosition: { x, y }
      });
    },
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
      set({
        selectedPath: newPath
      });
      get().performSearch(get().searchTerm);
    },

    /**
     * Performs a search for nodes based on the current search criteria
     *
     * This function:
     * 1. Validates the search request against the current search ID
     * 2. Retrieves metadata and filters out nodes without required API keys
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
      // If a searchId is provided and it doesn't match current, cancel the search
      if (searchId !== undefined && searchId !== get().currentSearchId) {
        return;
      }

      // Get all required state variables at the beginning
      const store = get();
      const metadata = useMetadataStore.getState().metadata;
      const secrets = useRemoteSettingsStore.getState().secrets;
      const searchTerm = store.searchTerm;
      const selectedInputType = store.selectedInputType;
      const selectedOutputType = store.selectedOutputType;
      const selectedPath = store.selectedPath;
      const selectedPathString = selectedPath.join(".");
      const hasTypeFilters = selectedInputType || selectedOutputType;
      const hasSearchTerm = term.trim().length > 0;

      if (Object.keys(metadata).length === 0) {
        set({ searchResults: [], highlightedNamespaces: [] });
        return;
      }

      // Early exit if no search criteria
      if (!hasSearchTerm && !selectedPathString && !hasTypeFilters) {
        set({
          searchResults: [],
          groupedSearchResults: []
        });
        store.updateHighlightedNamespaces([]);
        return;
      }

      // Filter out nodes in the "default" namespace
      const filteredMetadata = Object.values(metadata).filter((node) => {
        if (node.namespace === "default") return false;

        // Only filter by API keys during search or type filtering
        if (shouldFilterByApiKey(term, store)) {
          if (isNodeApiKeyMissing(node, secrets)) {
            return false;
          }
        }

        return true;
      });

      // Filter by type
      const typeFilteredMetadata = filterDataByType(
        filteredMetadata,
        selectedInputType as TypeName,
        selectedOutputType as TypeName
      );

      // Get nodes that match the search term
      let searchMatchedNodes = typeFilteredMetadata;
      if (term.trim()) {
        const allEntries = typeFilteredMetadata.map((node: NodeMetadata) => {
          const { description, tags, useCases } = formatNodeDocumentation(
            node.description
          );

          return {
            title: node.title,
            node_type: node.node_type,
            namespace: node.namespace,
            description: description,
            use_cases: useCases.raw,
            tags: tags.join(", "),
            metadata: node
          };
        });
        const groupedResults = performGroupedSearch(allEntries, term);
        searchMatchedNodes = groupedResults.flatMap((group) => group.nodes);
      }

      // Store all search matches
      set({ allSearchMatches: searchMatchedNodes });

      // Determine which results to show based on search criteria
      let filteredResults;
      if (hasSearchTerm || hasTypeFilters) {
        // With search term or type filters, show matching results filtered by path
        filteredResults = selectedPathString
          ? searchMatchedNodes.filter((node) => {
              if (!selectedPathString.includes(".")) {
                return node.namespace.startsWith(selectedPathString);
              }
              return (
                node.namespace === selectedPathString ||
                (node.namespace.startsWith(selectedPathString + ".") &&
                  node.namespace.split(".").length ===
                    selectedPathString.split(".").length + 1)
              );
            })
          : searchMatchedNodes;
      } else {
        // Without search term, show nodes for selected path only
        filteredResults = typeFilteredMetadata.filter((node) => {
          if (!selectedPathString.includes(".")) {
            return node.namespace.startsWith(selectedPathString);
          }
          return (
            node.namespace === selectedPathString ||
            (node.namespace.startsWith(selectedPathString + ".") &&
              node.namespace.split(".").length ===
                selectedPathString.split(".").length + 1)
          );
        });
      }

      // Sort results
      const sortedResults = filteredResults.sort((a, b) => {
        const namespaceComparison = a.namespace.localeCompare(b.namespace);
        return namespaceComparison !== 0
          ? namespaceComparison
          : a.title.localeCompare(b.title);
      });

      // Create grouped results
      const groupedResults =
        selectedPathString && !hasSearchTerm
          ? [
              {
                title: selectedPathString,
                nodes: sortedResults
              }
            ]
          : performGroupedSearch(
              sortedResults.map((node) => {
                const { description, tags, useCases } = formatNodeDocumentation(
                  node.description
                );
                return {
                  title: node.title,
                  node_type: node.node_type,
                  namespace: node.namespace,
                  description: description,
                  use_cases: useCases.raw,
                  tags: tags.join(", "),
                  metadata: node
                };
              }),
              term
            );

      set({
        searchResults: sortedResults,
        groupedSearchResults: groupedResults
      });

      store.updateHighlightedNamespaces(searchMatchedNodes);
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
    closeDocumentation: () =>
      set({
        selectedNodeType: null,
        showDocumentation: false
      }),

    groupedSearchResults: [],

    // Add back missing required properties
    clickPosition: { x: 0, y: 0 },

    openNodeMenu: (params: OpenNodeMenuParams) => {
      set({ clickPosition: { x: params.x, y: params.y } });
      const { menuWidth, menuHeight } = get();
      const maxPosX = window.innerWidth - menuWidth;
      const maxPosY = window.innerHeight - menuHeight - 40;
      const constrainedX = Math.min(Math.max(params.x, 0), maxPosX);
      const minPosY = 0;
      const menuOffset = 20;
      const constrainedY = Math.min(
        Math.max(params.y + menuOffset, minPosY),
        maxPosY
      );

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

      console.log("searchParamsChanged", searchParamsChanged);

      set({
        isMenuOpen: true,
        searchTerm: params.searchTerm || "",
        menuPosition: { x: constrainedX, y: constrainedY },
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
            : ""
      });

      // Only perform search if any search-related params changed
      if (searchParamsChanged) {
        setTimeout(() => {
          get().performSearch(params.searchTerm || "");
        }, 0);
      }
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
          selectedOutputType: ""
        });
      }
    },

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

    filterNodes,

    // Add new properties for search cancellation
    currentSearchId: 0,
    setCurrentSearchId: (id) => set({ currentSearchId: id })
  };
});

export default useNodeMenuStore;
