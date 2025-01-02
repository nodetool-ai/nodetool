import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import Fuse from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";
import useRemoteSettingsStore from "./RemoteSettingStore";
const fuseOptions = {
  keys: [
    { name: "title", weight: 0.4 },
    { name: "namespace", weight: 0.4 },
    { name: "tags", weight: 0.2 }
  ],
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.3,
  distance: 100,
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 2,
  useExtendedSearch: true,
  tokenize: true,
  matchAllTokens: false
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
};

const useNodeMenuStore = create<NodeMenuStore>((set, get) => ({
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
  setSelectedPath: (path) => {
    set({
      selectedPath: path
    });
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

    // Filter out nodes in the "default" namespace and nodes with missing API keys
    const filteredMetadata = metadata.filter((node) => {
      if (node.namespace === "default") return false;

      // Check for required API keys based on namespace
      if (
        node.namespace.startsWith("openai.") &&
        (!secrets.OPENAI_API_KEY || secrets.OPENAI_API_KEY.trim() === "")
      ) {
        return false;
      }
      if (
        node.namespace.startsWith("replicate.") &&
        (!secrets.REPLICATE_API_TOKEN ||
          secrets.REPLICATE_API_TOKEN.trim() === "")
      ) {
        return false;
      }
      if (
        node.namespace.startsWith("anthropic.") &&
        (!secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY.trim() === "")
      ) {
        return false;
      }
      if (
        node.namespace.startsWith("aime.") &&
        (!secrets.AIME_API_KEY ||
          secrets.AIME_API_KEY.trim() === "" ||
          !secrets.AIME_USER ||
          secrets.AIME_USER.trim() === "")
      ) {
        return false;
      }
      if (
        node.namespace.startsWith("kling.") &&
        (!secrets.KLING_ACCESS_KEY ||
          secrets.KLING_ACCESS_KEY.trim() === "" ||
          !secrets.KLING_SECRET_KEY ||
          secrets.KLING_SECRET_KEY.trim() === "")
      ) {
        return false;
      }
      if (
        node.namespace.startsWith("lumaai.") &&
        (!secrets.LUMAAI_API_KEY || secrets.LUMAAI_API_KEY.trim() === "")
      ) {
        return false;
      }

      return true;
    });

    // Filter by type
    const typeFilteredMetadata = filterDataByType(
      filteredMetadata,
      get().selectedInputType as TypeName,
      get().selectedOutputType as TypeName
    );

    // If no search term is provided, return filtered metadata
    if (!term.trim()) {
      set({ searchResults: typeFilteredMetadata });
      get().updateHighlightedNamespaces(typeFilteredMetadata);
      return;
    }

    // Prepare search entries with combined searchable text
    const entries = typeFilteredMetadata.map((node: NodeMetadata) => ({
      title: node.title,
      node_type: node.node_type,
      namespace: node.namespace,
      tags: node.description.split("\n")[1]?.split(",") || [],
      searchableText: `${node.namespace} ${node.title}`, // Combined text for searching
      metadata: node
    }));

    const fuse = new Fuse(entries, {
      ...fuseOptions,
      keys: [
        ...fuseOptions.keys,
        { name: "searchableText", weight: 1.0 } // Add combined text field
      ]
    });

    const searchResults = fuse
      .search(term)
      .map((result) => result.item.metadata);

    set({ searchResults });
    get().updateHighlightedNamespaces(searchResults);
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
  setFocusedNodeIndex: (index) => set({ focusedNodeIndex: index })
}));

export default useNodeMenuStore;
