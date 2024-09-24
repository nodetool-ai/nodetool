/** @jsxImportSource @emotion/react */

import { create } from "zustand";
import { Asset } from "./ApiTypes";
import { useAssetStore } from "../stores/AssetStore";
import { Node } from "@xyflow/react";

interface SortedAssetsByType {
  assetsByType: Record<string, Asset[]>;
  totalCount: number;
}

type SessionStateStore = {
  selectedNodeIds: string[];
  selectedNodes: Node[];
  setSelectedNodes: (nodes: Node[]) => void;
  clipboardData: string | null;
  setClipboardData: (data: string | null) => void;
  isClipboardValid: boolean;
  setIsClipboardValid: (isValid: boolean) => void;
};

const useSessionStateStore = create<SessionStateStore>((set) => ({
  // NODE SELECTION
  selectedNodeIds: [],
  selectedNodes: [],
  setSelectedNodes: (nodes: Node[]) => {
    set({
      selectedNodes: nodes,
      selectedNodeIds: nodes.map((node) => node.id)
    });
  },
  // CLIPBOARD
  clipboardData: null,
  isClipboardValid: false,
  setClipboardData: (data) => set({ clipboardData: data }),
  setIsClipboardValid: (isValid) => set({ isClipboardValid: isValid })
}));

export default useSessionStateStore;
