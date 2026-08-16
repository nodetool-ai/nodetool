/**
 * A read-only stand-in for `NodeStore`, for surfaces that render node
 * components without an editor behind them: the standalone graph viewer, the
 * version preview, and the e2e runner's canvas.
 *
 * Node components read the graph through `useNodes()`, i.e. through
 * `NodeContext`, whose value is the full editor store. These surfaces have no
 * editor: they hold a fixed node/edge list and every mutator is a no-op. This
 * module is the one place that says so.
 */
import { create } from "zustand";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "./NodeData";
import type { NodeStore } from "./NodeStore";
import type { Workflow } from "./ApiTypes";

/** The members a node component reads or calls while rendering. */
interface ReadOnlyNodeStoreState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflow: Workflow;
  viewport: null;
  shouldFitToScreen: boolean;
  setShouldFitToScreen: () => void;
  onNodesChange: () => void;
  onEdgesChange: () => void;
  onEdgeUpdate: () => void;
  deleteEdge: () => void;
  setEdgeSelectionState: () => void;
  updateNode: () => void;
  updateNodeData: () => void;
  getSelectedNodeCount: () => number;
  findNode: (id: string) => Node<NodeData> | undefined;
  getNodesByType: () => never[];
}

/**
 * Builds the stand-in and hands it out as the `NodeStore` `NodeContext`
 * expects.
 *
 * The assertion here is the whole point of the module: the editor store
 * declares ~50 members, this declares the dozen a rendered node touches, and
 * neither type is assignable to the other. A viewer that grows a component
 * reaching for a thirteenth member fails loudly on `undefined` — which is why
 * the members live in a checked interface instead of an `any`-shaped bag.
 */
export const createReadOnlyNodeStore = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflow: Workflow
): NodeStore => {
  // Every rendered node component calls findNode, so a scan per call makes
  // rendering O(N^2).
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const store = create<ReadOnlyNodeStoreState>(() => ({
    nodes,
    edges,
    workflow,
    viewport: null,
    shouldFitToScreen: false,
    setShouldFitToScreen: () => {},
    onNodesChange: () => {},
    onEdgesChange: () => {},
    onEdgeUpdate: () => {},
    deleteEdge: () => {},
    setEdgeSelectionState: () => {},
    updateNode: () => {},
    updateNodeData: () => {},
    getSelectedNodeCount: () => 0,
    findNode: (id: string) => nodesById.get(id),
    getNodesByType: () => []
  }));
  // SAFETY: see the docblock — the members a rendered node reads are all
  // present; the editor-only rest of `NodeStoreState` is never reached from a
  // read-only surface.
  return store as unknown as NodeStore;
};
