import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import Fuse, { IFuseOptions } from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";
import useRemoteSettingsStore from "./RemoteSettingStore";
import { usePanelStore } from "./PanelStore";
import { formatNodeDocumentation } from "./formatNodeDocumentation";
import { fuseOptions, ExtendedFuseOptions } from "./fuseOptions";

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
  getCurrentNodes: () => NodeMetadata[];

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

    switch (rootNamespace) {
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

    const minSearchTermLength =
      get().searchTerm.includes("+") ||
      get().searchTerm.includes("-") ||
      get().searchTerm.includes("*") ||
      get().searchTerm.includes("/")
        ? 0
        : 1;

    const filteredNodes = nodes
      .filter((node) => {
        // When searching or filtering by types, show all matching nodes
        if (
          get().searchTerm.length > minSearchTermLength ||
          get().selectedInputType ||
          get().selectedOutputType
        ) {
          return get().searchResults.some(
            (result) =>
              result.title === node.title && result.namespace === node.namespace
          );
        }

        // Otherwise filter by namespace selection
        const selectedPathString = get().selectedPath.join(".");
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
      })
      .sort((a, b) => {
        const namespaceComparison = a.namespace.localeCompare(b.namespace);
        return namespaceComparison !== 0
          ? namespaceComparison
          : a.title.localeCompare(b.title);
      });

    return filteredNodes;
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

    performSearch: (term: string, searchId?: number) => {
      // If a searchId is provided and it doesn't match current, cancel the search
      if (searchId !== undefined && searchId !== get().currentSearchId) {
        return;
      }
      console.log("performSearch", term);

      const metadata = useMetadataStore.getState().getAllMetadata();
      const secrets = useRemoteSettingsStore.getState().secrets;

      if (metadata.length === 0) {
        set({ searchResults: metadata, highlightedNamespaces: [] });
        return;
      }

      // Filter out nodes in the "default" namespace
      const filteredMetadata = metadata.filter((node) => {
        if (node.namespace === "default") return false;

        // Only filter by API keys during search or type filtering
        if (shouldFilterByApiKey(term, get())) {
          if (isNodeApiKeyMissing(node, secrets)) {
            return false;
          }
        }

        return true;
      });

      // Filter by type
      const typeFilteredMetadata = filterDataByType(
        filteredMetadata,
        get().selectedInputType as TypeName,
        get().selectedOutputType as TypeName
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

      // Get nodes in the selected path
      const selectedPathString = get().selectedPath.join(".");

      // Show results if we have a search term or type filters
      const hasTypeFilters =
        get().selectedInputType || get().selectedOutputType;
      const hasSearchTerm = term.trim().length > 0;

      if (!hasSearchTerm && !selectedPathString && !hasTypeFilters) {
        set({
          searchResults: [],
          groupedSearchResults: []
        });
        get().updateHighlightedNamespaces([]);
        return;
      }

      // If we have a search term or type filters, show all matching results
      if (hasSearchTerm || hasTypeFilters) {
        const filteredResults = selectedPathString
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

        const groupedResults = selectedPathString
          ? [
              {
                title: selectedPathString,
                nodes: filteredResults
              }
            ]
          : performGroupedSearch(
              filteredResults.map((node) => {
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
          searchResults: filteredResults,
          groupedSearchResults: groupedResults
        });

        get().updateHighlightedNamespaces(searchMatchedNodes);
        return;
      }

      // Show nodes for selected path only
      const nodesInPath = typeFilteredMetadata.filter((node) => {
        if (!selectedPathString.includes(".")) {
          return node.namespace.startsWith(selectedPathString);
        }
        const matches =
          node.namespace === selectedPathString ||
          (node.namespace.startsWith(selectedPathString + ".") &&
            node.namespace.split(".").length ===
              selectedPathString.split(".").length + 1);
        return matches;
      });

      const allResults = [
        {
          title: selectedPathString,
          nodes: nodesInPath
        }
      ];

      set({
        searchResults: nodesInPath,
        groupedSearchResults: allResults
      });

      get().updateHighlightedNamespaces(nodesInPath);
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

      set({
        isMenuOpen: true,
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

      setTimeout(() => {
        get().performSearch(params.searchTerm || "");
      }, 0);
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
    getCurrentNodes: () => {
      const metadata = useMetadataStore.getState().getAllMetadata();
      return filterNodes(metadata);
    },

    // Add new properties for search cancellation
    currentSearchId: 0,
    setCurrentSearchId: (id) => set({ currentSearchId: id })
  };
});

export default useNodeMenuStore;
