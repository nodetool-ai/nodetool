import { create } from "zustand";
import { NodeMetadata, TypeMetadata } from "./ApiTypes";
import {
  filterTypesByInputType,
  filterTypesByOutputType
} from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";

interface ConnectableNodesState {
  nodeMetadata: NodeMetadata[];
  filterType: "input" | "output" | null;
  typeMetadata: TypeMetadata | null;
  isVisible: boolean;
  sourceHandle: string | null;
  targetHandle: string | null;
  nodeId: string | null;
  menuPosition: { x: number; y: number } | null;
  setSourceHandle: (sourceHandle: string | null) => void;
  setTargetHandle: (targetHandle: string | null) => void;
  setNodeId: (nodeId: string | null) => void;
  setFilterType: (type: "input" | "output" | null) => void;
  setTypeMetadata: (metadata: TypeMetadata | null) => void;
  getConnectableNodes: () => NodeMetadata[];
  showMenu: (position: { x: number; y: number }) => void;
  hideMenu: () => void;
}

const useConnectableNodesStore = create<ConnectableNodesState>((set, get) => ({
  nodeMetadata: [],
  filterType: null,
  typeMetadata: null,
  isVisible: false,
  menuPosition: null,
  sourceHandle: null,
  targetHandle: null,
  nodeId: null,
  setSourceHandle: (sourceHandle) => set({ sourceHandle }),
  setTargetHandle: (targetHandle) => set({ targetHandle }),
  setNodeId: (nodeId) => set({ nodeId }),
  setFilterType: (type) => set({ filterType: type }),
  setTypeMetadata: (metadata) => set({ typeMetadata: metadata }),
  showMenu: (position) => set({ isVisible: true, menuPosition: position }),
  hideMenu: () => set({ isVisible: false, menuPosition: null }),

  getConnectableNodes: () => {
    const { filterType, typeMetadata } = get();
    const metadata = Object.values(useMetadataStore.getState().metadata);

    if (!typeMetadata || !filterType) {
      return [];
    }

    if (filterType === "input") {
      return filterTypesByInputType(metadata, typeMetadata);
    } else {
      return filterTypesByOutputType(metadata, typeMetadata);
    }
  }
}));

export default useConnectableNodesStore;
