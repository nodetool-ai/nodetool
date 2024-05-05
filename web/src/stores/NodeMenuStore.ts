import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";

type NodeMenuStore = {
  isMenuOpen: boolean;
  openedByDrop: boolean;
  connectDirection: ConnectDirection;
  setConnectDirection: (direction: ConnectDirection) => void;
  dropType: string;
  menuPosition: { x: number; y: number };
  setMenuPosition: (x: number, y: number) => void;
  menuWidth: number;
  menuHeight: number;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedPath: string[];
  setSelectedPath: (path: string[]) => void;
  openNodeMenu: (
    x: number,
    y: number,
    openedByDrop?: boolean,
    dropType?: string,
    connectDirection?: ConnectDirection
  ) => void;
  closeNodeMenu: () => void;

  description: string | undefined;
  setDescription: (description: string) => void;

  isDescriptionOpen: boolean;
  openDescription: (description: string) => void;
  closeDescription: () => void;

  searchResults: NodeMetadata[];
  setSearchResults: (results: NodeMetadata[]) => void;
  highlightedNamespaces: string[];
  setHighlightedNamespaces: (namespaces: string[]) => void;
  hoveredNode: NodeMetadata | null;
  setHoveredNode: (node: NodeMetadata | null) => void;
};

const useNodeMenuStore = create<NodeMenuStore>((set, get) => ({
  // menu
  isMenuOpen: false,
  openedByDrop: false,
  dropType: "",
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
  },
  selectedPath: [],
  setSelectedPath: (path) => {
    set({
      selectedPath: path
    });
  },
  openNodeMenu: (
    x,
    y,
    byDrop: boolean = false,
    dropType: string = "",
    connectDirection: ConnectDirection = null
  ) => {
    // const maxPosX = window.innerWidth - get().menuWidth;
    // const maxPosY = window.innerHeight - get().menuHeight;
    // const constrainedX = Math.min(Math.max(x, 0), maxPosX) - 20;
    // const constrainedY = Math.min(Math.max(y, 0), maxPosY) - 20;
    set({
      isMenuOpen: true,
      menuPosition: { x: x, y: y },
      openedByDrop: byDrop,
      dropType: dropType,
      connectDirection: connectDirection
    });
  },

  closeNodeMenu: () => {
    if (get().openedByDrop) {
      set({ openedByDrop: false });
    } else {
      set({
        searchTerm: "",
        dropType: "",
        connectDirection: null,
        openedByDrop: false,
        isMenuOpen: false,
        menuPosition: { x: 100, y: 100 }
      });
    }
  },

  // description
  description: undefined,
  setDescription: (description) => set({ description }),

  isDescriptionOpen: false,
  openDescription: (newDescription) => {
    if (newDescription.trim() === "") {
      newDescription = "No description";
    }
    // const currentDescription = get().description;
    const newDescriptionTidy = newDescription
      .replace(/^ +/gm, "")
      .replace("NodeCategory: ", "")
      .replace("Category: ", "");
    set({
      description: newDescriptionTidy,
      isDescriptionOpen: true
    });
  },
  closeDescription: () => {
    set({ isDescriptionOpen: false });
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
  }
}));

export default useNodeMenuStore;
