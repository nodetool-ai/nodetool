import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import Fuse, { IFuseOptions } from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";
import useRemoteSettingsStore from "./RemoteSettingStore";
import { devLog } from "../utils/DevLog";

// Extend Fuse options type
interface ExtendedFuseOptions<T> extends Omit<IFuseOptions<T>, "keys"> {
  keys?: Array<{ name: string; weight: number }>;
  tokenize?: boolean;
  matchAllTokens?: boolean;
  findAllMatches?: boolean;
}

const fuseOptions: ExtendedFuseOptions<any> = {
  keys: [
    // Relative importance
    { name: "title", weight: 0.8 },
    { name: "namespace", weight: 0.4 },
    { name: "tags", weight: 0.4 },
    { name: "description", weight: 0.3 }
  ],
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.3,
  distance: 2,
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 3,
  useExtendedSearch: true,
  tokenize: false,
  matchAllTokens: false,
  findAllMatches: true
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
      default:
        return false;
    }
  };

  const performGroupedSearch = (entries: any[], term: string) => {
    // Title matches
    const titleFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 2,
      minMatchCharLength: 3,
      keys: [{ name: "title", weight: 1.0 }]
    });

    // Title + tags matches
    const titleTagsFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 2,
      minMatchCharLength: 2,
      keys: [
        { name: "namespace", weight: 0.8 },
        { name: "tags", weight: 0.6 }
      ]
    });

    // Description matches
    const descriptionFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.1,
      distance: 20,
      minMatchCharLength: 4,
      keys: [
        { name: "description", weight: 0.9 },
        { name: "use_cases", weight: 0.9 }
      ],
      tokenize: true,
      tokenSeparator: /[\s\.,\-]+/,
      findAllMatches: false,
      ignoreLocation: true,
      includeMatches: true
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
      const currentPath = get().selectedPath;
      const newPath = currentPath.join(".") === path.join(".") ? [] : path;

      set({
        selectedPath: newPath
      });
      // Trigger a new search with current term to show namespace nodes
      get().performSearch(get().searchTerm);
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

      // Filter by selected path if one exists
      const selectedPathString = get().selectedPath.join(".");
      const pathFilteredMetadata = selectedPathString
        ? typeFilteredMetadata.filter((node) => {
            const matches =
              node.namespace === selectedPathString ||
              (node.namespace.startsWith(selectedPathString + ".") &&
                node.namespace.split(".").length ===
                  selectedPathString.split(".").length + 1);
            return matches;
          })
        : typeFilteredMetadata;

      // If no search term is provided, show all nodes in the current path
      if (!term.trim()) {
        const allResults = [
          {
            title: selectedPathString || "All",
            nodes: pathFilteredMetadata
          }
        ];
        set({
          searchResults: pathFilteredMetadata,
          groupedSearchResults: allResults
        });
        get().updateHighlightedNamespaces(pathFilteredMetadata);
        return;
      }

      // Prepare search entries
      const entries = pathFilteredMetadata.map((node: NodeMetadata) => {
        const lines = node.description.split("\n");
        const firstLine = lines[0] || "";
        const tags = lines[1]
          ? lines[1]
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
        const useCases = lines.slice(2).join(" ");

        // Create separate entries for description and use cases
        return {
          title: node.title,
          node_type: node.node_type,
          namespace: node.namespace,
          description: firstLine, // Keep first line separate
          use_cases: useCases, // Keep use cases separate
          tags,
          metadata: node
        };
      });

      // Description matches
      const descriptionFuse = new Fuse(entries, {
        ...fuseOptions,
        threshold: 0.1,
        distance: 20,
        minMatchCharLength: 4,
        keys: [
          { name: "description", weight: 0.9 },
          { name: "use_cases", weight: 0.9 }
        ],
        tokenize: true,
        tokenSeparator: /[\s\.,\-]+/,
        findAllMatches: false,
        ignoreLocation: true,
        includeMatches: true
      } as ExtendedFuseOptions<any>);

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
