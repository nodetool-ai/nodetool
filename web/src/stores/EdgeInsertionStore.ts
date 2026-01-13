/**
 * EdgeInsertionStore
 *
 * Manages state for inserting nodes into existing edges.
 * When a user double-clicks an edge, this store tracks which edge
 * is being split so that when a node is selected from the menu,
 * it can be inserted inline.
 */

import { create } from "zustand";
import { Edge } from "@xyflow/react";

interface EdgeInsertionState {
  /** The edge being split, or null if not in insertion mode */
  targetEdge: Edge | null;
  /** Screen position where the insertion should occur */
  insertPosition: { x: number; y: number } | null;
  /** Start edge insertion mode */
  startInsertion: (edge: Edge, position: { x: number; y: number }) => void;
  /** Cancel edge insertion mode */
  cancelInsertion: () => void;
  /** Check if currently in insertion mode */
  isInsertionMode: () => boolean;
}

const useEdgeInsertionStore = create<EdgeInsertionState>((set, get) => ({
  targetEdge: null,
  insertPosition: null,

  startInsertion: (edge: Edge, position: { x: number; y: number }) => {
    set({
      targetEdge: edge,
      insertPosition: position
    });
  },

  cancelInsertion: () => {
    set({
      targetEdge: null,
      insertPosition: null
    });
  },

  isInsertionMode: () => {
    return get().targetEdge !== null;
  }
}));

export default useEdgeInsertionStore;
