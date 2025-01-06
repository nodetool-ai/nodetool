import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import Fuse from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";
import useRemoteSettingsStore from "./RemoteSettingStore";
import { devLog } from "../utils/DevLog";
const fuseOptions = {
  keys: [
    // Relative importance
    { name: "title", weight: 0.8 },
    { name: "namespace", weight: 0.4 },
    { name: "tags", weight: 0.4 },
    { name: "description", weight: 0.3 }
  ],
  includeMatches: true, // Include details about which fields matched
  ignoreLocation: true, // Search the entire field, don't prefer matches at start
  threshold: 0.3, // More lenient matching
  distance: 2, // Allow matches with characters further apart
  includeScore: true, // Include similarity score in results
  shouldSort: true, // Sort results by best match
  minMatchCharLength: 2, // Minimum characters that must match
  useExtendedSearch: true, // Enable extended search operators like ! ^ *
  tokenize: true, // Split strings into tokens for matching
  matchAllTokens: false // Match any token instead of requiring all tokens to match
};

export type SearchResultGroup = {
  title: string;
  nodes: NodeMetadata[];
};

type NodeMenuStore = {
  isMenuOpen: boolean;
  dragToCreate: boolean;
  setDragToCreate: (dragToCreate: boolean) => void;
  connectDirection: ConnectDirection;
  setConnectDirection: (direction: ConnectDirection) => void;
  openedByDrop: boolean;
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
  performSearch: (term: string) => void;
  updateHighlightedNamespaces: (results: NodeMetadata[]) => void;

  openNodeMenu: (
    x: number,
    y: number,
    openedByDrop?: boolean,
    dropType?: string,
    connectDirection?: ConnectDirection,
    searchTerm?: string
  ) => void;
  closeNodeMenu: () => void;

  searchResults: NodeMetadata[];
  setSearchResults: (results: NodeMetadata[]) => void;
  highlightedNamespaces: string[];
  setHighlightedNamespaces: (namespaces: string[]) => void;
  hoveredNode: NodeMetadata | null;
  setHoveredNode: (node: NodeMetadata | null) => void;

  // DraggableNodeDocumentation
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

  focusedNodeIndex: number;
  setFocusedNodeIndex: (index: number) => void;

  clickPosition: { x: number; y: number };

  groupedSearchResults: SearchResultGroup[];
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
      case "aime":
        return (
          !secrets.AIME_API_KEY ||
          secrets.AIME_API_KEY.trim() === "" ||
          !secrets.AIME_USER ||
          secrets.AIME_USER.trim() === ""
        );
      case "kling":
        return (
          !secrets.KLING_ACCESS_KEY ||
          secrets.KLING_ACCESS_KEY.trim() === "" ||
          !secrets.KLING_SECRET_KEY ||
          secrets.KLING_SECRET_KEY.trim() === ""
        );
      case "luma":
        return !secrets.LUMAAI_API_KEY || secrets.LUMAAI_API_KEY.trim() === "";
      default:
        return false;
    }
  };

  const performGroupedSearch = (entries: any[], term: string) => {
    // Title matches (strict)
    const titleFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 3,
      minMatchCharLength: 2,
      keys: [{ name: "title", weight: 1.0 }]
    });

    // Title + tags matches (medium fuzzy)
    const titleTagsFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 1,
      minMatchCharLength: 2,

      keys: [
        { name: "namespace", weight: 0.8 },
        { name: "tags", weight: 0.6 }
      ]
    });

    // Description matches (more fuzzy)
    const descriptionFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.15,
      distance: 2,
      minMatchCharLength: 4,
      keys: [{ name: "description", weight: 0.8 }]
    });

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

    const descriptionResults = descriptionFuse
      .search(term)
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

  return {
    // menu
    isMenuOpen: false,
    openedByDrop: false,
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
        selectedPath: []
      });
      get().performSearch(term);
    },
    selectedPath: [],
    setSelectedPath: (path: string[]) => {
      set({
        selectedPath: path,
        searchTerm: "" // Clear search when selecting a path
      });
      // Trigger a new search with empty term to show namespace nodes
      get().performSearch("");
    },
    clickPosition: { x: 0, y: 0 },
    openNodeMenu: (
      x,
      y,
      openedByDrop: boolean = false,
      dropType: string = "",
      connectDirection: ConnectDirection = null,
      searchTerm: string = ""
    ) => {
      const { menuWidth, menuHeight } = get();

      // Store the original click position
      set({ clickPosition: { x, y } });

      // Calculate menu position
      const maxPosX = window.innerWidth - menuWidth + 150;
      const maxPosY = window.innerHeight - menuHeight;

      // Constrain x position to keep menu within window bounds
      const constrainedX = Math.min(Math.max(x, 0), maxPosX);

      // Position the menu below the click point, with some offset
      const menuOffset = 20; // Add some space between click point and menu
      const constrainedY = Math.min(y + menuOffset, maxPosY);

      set({
        isMenuOpen: true,
        menuPosition: { x: constrainedX, y: constrainedY },
        openedByDrop,
        dropType,
        connectDirection
      });

      setTimeout(() => {
        get().performSearch(searchTerm);
      }, 0);
    },

    closeNodeMenu: () => {
      if (get().dragToCreate) {
        set({ dragToCreate: false });
        return;
      }
      if (get().openedByDrop) {
        set({ openedByDrop: false });
        return;
      }
      set({
        searchTerm: "",
        openedByDrop: false,
        dropType: "",
        dragToCreate: false,
        connectDirection: null,
        isMenuOpen: false,
        menuPosition: { x: 100, y: 100 }
      });
    },

    performSearch: (term: string) => {
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

      // If no search term is provided, show nodes based on selected path
      if (!term.trim()) {
        const selectedPathString = get().selectedPath.join(".");

        // If no path is selected and no search term, return empty results
        if (!selectedPathString) {
          set({
            searchResults: [],
            groupedSearchResults: []
          });
          get().updateHighlightedNamespaces([]);
          return;
        }

        // Show nodes for selected path
        const nodesInPath = typeFilteredMetadata.filter((node) => {
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
        return;
      }

      // Prepare search entries
      const entries = typeFilteredMetadata.map((node: NodeMetadata) => {
        // Get tags from second line, guaranteed to be tags
        const lines = node.description.split("\n");
        const tags = lines[1]
          ? lines[1]
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [];

        // Use full description instead of just first line
        const description = node.description || "";

        const entry = {
          title: node.title,
          node_type: node.node_type,
          namespace: node.namespace,
          description,
          tags,
          // Include all searchable fields in the combined text
          searchableText: `${node.namespace} ${node.title} ${tags.join(
            " "
          )} ${description}`,
          metadata: node
        };

        // Debug log for entries containing "illustration"
        if (description.toLowerCase().includes("illustration")) {
          devLog("Found node with illustration:", entry);
        }

        return entry;
      });

      const groupedResults = performGroupedSearch(entries, term);
      const allResults = groupedResults.flatMap((group) => group.nodes);

      set({
        searchResults: allResults,
        groupedSearchResults: groupedResults
      });

      get().updateHighlightedNamespaces(allResults);
    },

    updateHighlightedNamespaces: (results: NodeMetadata[]) => {
      const newHighlightedNamespaces = new Set(
        results.flatMap((result) => {
          const parts = result.namespace.split(".");
          return parts.map((_, index) => parts.slice(0, index + 1).join("."));
        })
      );
      set({ highlightedNamespaces: [...newHighlightedNamespaces] });
    },

    searchResults: [],
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

    focusedNodeIndex: -1,
    setFocusedNodeIndex: (index) => set({ focusedNodeIndex: index }),

    groupedSearchResults: []
  };
});

export default useNodeMenuStore;
