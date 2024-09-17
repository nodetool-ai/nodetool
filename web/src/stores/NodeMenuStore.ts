import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import Fuse from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
const fuseOptions = {
  keys: [
    { name: "title", weight: 0.5 },
    { name: "namespace", weight: 0.3 },
    { name: "tags", weight: 0.2 }
  ],
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.2,
  distance: 100,
  shouldSort: true,
  includeScore: true,
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
  metadata: NodeMetadata[];
  setMetadata: (metadata: NodeMetadata[]) => void;
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

  openNodeMenu: (
    x: number,
    y: number,
    openedByDrop?: boolean,
    dropType?: string,
    connectDirection?: ConnectDirection,
    activeNode?: string
  ) => void;
  closeNodeMenu: () => void;

  searchResults: NodeMetadata[];
  setSearchResults: (results: NodeMetadata[]) => void;
  highlightedNamespaces: string[];
  setHighlightedNamespaces: (namespaces: string[]) => void;
  hoveredNode: NodeMetadata | null;
  setHoveredNode: (node: NodeMetadata | null) => void;

  // New properties for DraggableNodeDocumentation
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
  metadata: [],
  setMetadata: (metadata) => {
    set({ metadata });
  },
  selectedInputType: "",
  setSelectedInputType: (inputType) => {
    set({ selectedInputType: inputType });
  },
  selectedOutputType: "",
  setSelectedOutputType: (outputType) => {
    set({ selectedOutputType: outputType });
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
    set((state) => ({ showNamespaceTree: !state.showNamespaceTree })),
  openNodeMenu: (
    x,
    y,
    openedByDrop: boolean = false,
    dropType: string = "",
    connectDirection: ConnectDirection = null,
  ) => {
    const maxPosX = window.innerWidth - get().menuWidth + 150;
    const maxPosY = window.innerHeight - get().menuHeight + 100;
    const constrainedX = Math.min(Math.max(x, 0), maxPosX) - 20;
    const constrainedY = Math.min(Math.max(y, 0), maxPosY) + 90;
    set({
      isMenuOpen: true,
      menuPosition: { x: constrainedX, y: constrainedY },
      openedByDrop: openedByDrop,
      dropType: dropType,
      connectDirection: connectDirection,
    });
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
    const metadata = get().metadata;
    const selectedInputType = get().selectedInputType;
    const selectedOutputType = get().selectedOutputType;

    if (metadata.length === 0) {
      console.warn("No metadata found");
      return;
    }
    if (term.length <= 1) {
      set({ searchResults: metadata });
      return;
    }

    const filteredMetadata = filterDataByType(
      metadata,
      selectedInputType as TypeName,
      selectedOutputType as TypeName
    );
    const newHighlightedNamespaces = new Set(
      filteredMetadata.flatMap((result) => {
        const parts = result.namespace.split(".");
        return parts.map((_, index) => parts.slice(0, index + 1).join("."));
      })
    );
    set({ highlightedNamespaces: [...newHighlightedNamespaces] });
    const entries = filteredMetadata.map((node: NodeMetadata) => {
      const lines = node.description.split("\n");
      const tags = lines.length > 1 ? lines[1].split(",") : [];
      return {
        title: node.title,
        node_type: node.node_type,
        tags: tags,
        metadata: node
      };
    });

    const fuse = new Fuse(entries, fuseOptions);

    const searchTermWords = Array.from(new Set(term.trim().split(" ")));

    const searchResults = searchTermWords.reduce(
      (acc: NodeMetadata[], word: string) => {
        const searchResults = fuse
          .search(word)
          .map((result) => result.item.metadata)
          .sort((a, b) => a.node_type.localeCompare(b.node_type));

        if (acc.length === 0) {
          return searchResults;
        } else {
          return [...acc, ...searchResults].filter(
            (v, i, a) => a.findIndex((t) => t.title === v.title) === i
          );
        }
      },
      [] as NodeMetadata[]
    );
    set({ searchResults });
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

  // New state and methods for DraggableNodeDocumentation
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
