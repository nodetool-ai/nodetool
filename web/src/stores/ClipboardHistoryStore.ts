/** @jsxImportSource @emotion/react */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface ClipboardItem {
  id: string;
  timestamp: number;
  nodeCount: number;
  edgeCount: number;
  previewNodes: Array<{
    id: string;
    type: string;
    label: string;
  }>;
  data: string;
}

interface ClipboardHistoryState {
  history: ClipboardItem[];
  maxHistorySize: number;
  addItem: (data: { nodes: Node<NodeData>[]; edges: Edge[] }) => void;
  clearHistory: () => void;
  removeItem: (id: string) => void;
  getItem: (id: string) => ClipboardItem | undefined;
}

const MAX_HISTORY_SIZE = 10;

const createClipboardItem = (
  nodes: Node<NodeData>[],
  edges: Edge[]
): ClipboardItem => {
  const timestamp = Date.now();

  const previewNodes = nodes.slice(0, 3).map((node) => {
    const data = node.data as Record<string, unknown>;
    const labelValue = data?.title || data?.name || node.id;
    return {
      id: node.id,
      type: node.type || "unknown",
      label: typeof labelValue === "string" ? labelValue : String(labelValue)
    };
  });

  return {
    id: `${timestamp}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    previewNodes,
    data: JSON.stringify({ nodes, edges })
  };
};

const useClipboardHistoryStore = create<ClipboardHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      maxHistorySize: MAX_HISTORY_SIZE,

      addItem: (item) => {
        const { history, maxHistorySize } = get();
        const clipboardItem = createClipboardItem(item.nodes, item.edges);

        const existingIndex = history.findIndex(
          (existing) => existing.data === clipboardItem.data
        );

        let newHistory: ClipboardItem[];

        if (existingIndex !== -1) {
          newHistory = [
            clipboardItem,
            ...history.slice(0, existingIndex),
            ...history.slice(existingIndex + 1)
          ];
        } else {
          newHistory = [clipboardItem, ...history];
        }

        if (newHistory.length > maxHistorySize) {
          newHistory = newHistory.slice(0, maxHistorySize);
        }

        set({ history: newHistory });
      },

      clearHistory: () => {
        set({ history: [] });
      },

      removeItem: (id) => {
        const { history } = get();
        set({ history: history.filter((item) => item.id !== id) });
      },

      getItem: (id) => {
        const { history } = get();
        return history.find((item) => item.id === id);
      }
    }),
    {
      name: "clipboard-history",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ history: state.history })
    }
  )
);

export default useClipboardHistoryStore;
