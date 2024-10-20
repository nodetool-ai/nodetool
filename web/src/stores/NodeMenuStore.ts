import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import Fuse from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";
const fuseOptions = {
  keys: [
    { name: "title", weight: 0.8 },
    { name: "namespace", weight: 0.1 },
    { name: "tags", weight: 0.1 }
  ],
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.2,
  distance: 30,
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 2,
  useExtendedSearch: true,
  tokenize: true,
  matchAllTokens: true
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
  showNamespaceTree: boolean;
  toggleNamespaceTree: () => void;
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
      searchTerm: term
    });
    get().performSearch(term);
  },
  selectedPath: [],
  setSelectedPath: (path) => {
    set({
      selectedPath: path
    });
  },
  showNamespaceTree: true,
  toggleNamespaceTree: () =>
    set((state) => ({
      showNamespaceTree: !state.showNamespaceTree,
      selectedPath: state.showNamespaceTree ? [] : state.selectedPath
    })),

  openNodeMenu: (
    x,
    y,
    openedByDrop: boolean = false,
    dropType: string = "",
    connectDirection: ConnectDirection = null,
    searchTerm: string = ""
  ) => {
    const { menuWidth, menuHeight } = get();
    const maxPosX = window.innerWidth - menuWidth + 150;
    const maxPosY = window.innerHeight - menuHeight;

    // Calculate vertical center
    const centerY = Math.max(0, (window.innerHeight - menuHeight) / 2 + 100);

    // Calculate horizontal center, respecting menuWidth
    const centerX = Math.max(0, (window.innerWidth - menuWidth) / 2 + 60);

    // Constrain X position to center, respecting bounds
    const constrainedX = Math.min(Math.max(centerX, 0), maxPosX);

    // Try to center vertically, but respect bounds
    const constrainedY = Math.min(Math.max(y - menuHeight / 2, 0), maxPosY);

    // Use centered Y if there's enough space, otherwise use constrained Y
    const finalY =
      y < centerY || y > window.innerHeight - centerY ? constrainedY : centerY;

    set({
      isMenuOpen: true,
      menuPosition: { x: constrainedX, y: finalY },
      openedByDrop,
      dropType,
      connectDirection,
      searchTerm,
      selectedPath: [],
      highlightedNamespaces: []
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

    if (metadata.length === 0) {
      set({ searchResults: metadata, highlightedNamespaces: [] });
      return;
    }

    // Filter by type
    const filteredMetadata = filterDataByType(
      metadata,
      get().selectedInputType as TypeName,
      get().selectedOutputType as TypeName
    );

    // If no search term is provided, return filtered metadata
    if (!term.trim()) {
      set({ searchResults: filteredMetadata });
      get().updateHighlightedNamespaces(filteredMetadata);
      return;
    }

    // Fuse search
    const entries = filteredMetadata.map((node: NodeMetadata) => ({
      title: node.title,
      node_type: node.node_type,
      tags: node.description.split("\n")[1]?.split(",") || [],
      metadata: node
    }));

    const fuse = new Fuse(entries, fuseOptions);
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
    })
}));

export default useNodeMenuStore;
