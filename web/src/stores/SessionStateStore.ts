/** @jsxImportSource @emotion/react */

import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

type SessionStateStore = {
  selectedNodeIds: string[];
  selectedNodes: Node<NodeData>[];
  setSelectedNodes: (nodes: Node<NodeData>[]) => void;
  clipboardData: string | null;
  setClipboardData: (data: string | null) => void;
  isClipboardValid: boolean;
  setIsClipboardValid: (isValid: boolean) => void;
};

const useSessionStateStore = create<SessionStateStore>((set) => ({
  // NODE SELECTION
  selectedNodeIds: [],
  selectedNodes: [],
  setSelectedNodes: (nodes: Node<NodeData>[]) => {
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
