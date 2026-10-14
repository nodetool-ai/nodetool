import type { NodeData } from "../stores/NodeData";
import type { NodeStore } from "../stores/NodeStore";
import { runAsOneUndoEntry } from "./runAsOneUndoEntry";

const inputSlotNames = (data: Partial<NodeData>): Set<string> =>
  new Set([
    ...Object.keys(data.dynamic_properties ?? {}),
    ...Object.keys(data.dynamic_inputs ?? {})
  ]);

/**
 * Writes a schema-driven node's new slot maps and deletes the edges on
 * dynamic handles the new maps no longer declare, as one undo entry. A saved
 * edge on a missing handle recreates that handle on the next load
 * (`ensureHandlesForEdges`), so the edge has to go with the slot. Edges on
 * static handles are never touched.
 */
export function replaceDynamicSlots(
  store: NodeStore,
  nodeId: string,
  update: Partial<NodeData>
): void {
  const { findNode, edges, updateNodeData, deleteEdges } = store.getState();
  const previous: Partial<NodeData> = findNode(nodeId)?.data ?? {};
  const next: Partial<NodeData> = { ...previous, ...update };

  const previousInputs = inputSlotNames(previous);
  const nextInputs = inputSlotNames(next);
  const previousOutputs = previous.dynamic_outputs ?? {};
  const nextOutputs = next.dynamic_outputs ?? {};

  const staleEdgeIds = edges
    .filter(
      (edge) =>
        (edge.target === nodeId &&
          !!edge.targetHandle &&
          previousInputs.has(edge.targetHandle) &&
          !nextInputs.has(edge.targetHandle)) ||
        (edge.source === nodeId &&
          !!edge.sourceHandle &&
          Object.hasOwn(previousOutputs, edge.sourceHandle) &&
          !Object.hasOwn(nextOutputs, edge.sourceHandle))
    )
    .map((edge) => edge.id);

  runAsOneUndoEntry(store, () => {
    updateNodeData(nodeId, update);
    deleteEdges(staleEdgeIds);
  });
}
