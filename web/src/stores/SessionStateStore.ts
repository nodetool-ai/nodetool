import { create } from "zustand";
import { Asset } from "./ApiTypes";
import { useAssetStore } from "./AssetStore";
import { Node } from "reactflow";

interface SortedAssetsByType {
  assetsByType: Record<string, Asset[]>;
  totalCount: number;
}

type SessionStateStore = {
  selectedNodeIds: string[];
  selectedNodes: Node[];
  setSelectedNodes: (nodes: Node[]) => void;
  selectedAssets: Asset[];
  selectedAssetIds: string[];
  setSelectedAssetIds: (ids: string[]) => void;
  filteredAssets: SortedAssetsByType;
  setFilteredAssets: (sortedAssetsByType: SortedAssetsByType) => void;
  clipboardData: string | null;
  setClipboardData: (data: string | null) => void;
  isClipboardValid: boolean;
  setIsClipboardValid: (isValid: boolean) => void;
};

const useSessionStateStore = create<SessionStateStore>((set) => ({
  // NODE SELECTION
  // NodeEditor + useDragHandlers set the selected nodes.
  // selectedNodeIds are kept in sync with selectedNodes.
  selectedNodeIds: [],
  selectedNodes: [],
  setSelectedNodes: (nodes: Node[]) => {
    set({
      selectedNodes: nodes,
      selectedNodeIds: nodes.map((node) => node.id)
    });
  },

  // ASSET SELECTION
  selectedAssetIds: [],
  selectedAssets: [],
  setSelectedAssetIds: (ids) => {
    set({ selectedAssetIds: ids });
    const fetchAndSetAssets = async () => {
      const { get: getAssetById } = useAssetStore.getState();
      const assets = await Promise.all(ids.map((id) => getAssetById(id)));
      const validAssets = assets.filter(
        (asset): asset is Asset => asset !== undefined
      );
      set({ selectedAssets: validAssets });
    };
    fetchAndSetAssets();
  },
  filteredAssets: {
    assetsByType: {},
    totalCount: 0
  },
  setFilteredAssets: (sortedAssetsByType) => {
    set({ filteredAssets: sortedAssetsByType });
  },

  // CLIPBOARD
  clipboardData: null,
  isClipboardValid: false,
  setClipboardData: (data) => set({ clipboardData: data }),
  setIsClipboardValid: (isValid) => set({ isClipboardValid: isValid })
}));

export default useSessionStateStore;
