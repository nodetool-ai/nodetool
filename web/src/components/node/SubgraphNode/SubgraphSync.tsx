import { memo, useEffect } from "react";
import isEqual from "../../../utils/isEqual";
import { useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import { runAsOneUndoEntry } from "../../../utils/runAsOneUndoEntry";
import { extractDynamicIO } from "../WorkflowNode";
import type { NodeData } from "../../../stores/NodeData";

interface SubgraphSyncProps {
  nodeId: string;
  data: NodeData;
}

/**
 * Watches the SubgraphNode's `graph` property and keeps the node's
 * dynamic_inputs / dynamic_outputs / dynamic_properties in sync with the
 * inner Input/Output nodes. The same IO extraction logic used by WorkflowNode
 * is reused — boundary ports are identified by node type prefix
 * (`nodetool.input.*` / `nodetool.output.*`). Outer edges on a port whose
 * inner node was renamed or removed are deleted in the same step: a saved
 * edge on a missing port recreates that port on the next load.
 */
export const SubgraphSync = memo(({ nodeId, data }: SubgraphSyncProps) => {
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const deleteEdges = useNodes((state) => state.deleteEdges);
  const nodeStore = useNodeStoreRef();
  const graph = data.properties?.graph as
    | { nodes?: unknown[]; edges?: unknown[] }
    | undefined;

  useEffect(() => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

    const { dynamic_inputs, dynamic_outputs, dynamic_properties } =
      extractDynamicIO({ graph: { nodes } });

    const nextDynamicInputs =
      Object.keys(dynamic_inputs).length > 0 ? dynamic_inputs : undefined;

    // The inner Input node's value only seeds the slot. Once the slot exists
    // on the outer node the user edits it there — inline on the node body —
    // and that value is what runs (SubgraphNode feeds its dynamic props to the
    // inner Input nodes as params). Re-reading the inner value on every sync
    // would snap each edit back.
    const previousProperties = data.dynamic_properties ?? {};
    const nextDynamicProperties: Record<string, unknown> = {};
    for (const name of Object.keys(dynamic_properties)) {
      nextDynamicProperties[name] = Object.hasOwn(previousProperties, name)
        ? previousProperties[name]
        : dynamic_properties[name];
    }

    if (
      isEqual(data.dynamic_inputs, nextDynamicInputs) &&
      isEqual(data.dynamic_outputs ?? {}, dynamic_outputs) &&
      isEqual(previousProperties, nextDynamicProperties)
    ) {
      return;
    }

    const staleEdgeIds = nodeStore
      .getState()
      .edges.filter(
        (edge) =>
          (edge.target === nodeId &&
            !!edge.targetHandle &&
            Object.hasOwn(previousProperties, edge.targetHandle) &&
            !Object.hasOwn(nextDynamicProperties, edge.targetHandle)) ||
          (edge.source === nodeId &&
            !!edge.sourceHandle &&
            Object.hasOwn(data.dynamic_outputs ?? {}, edge.sourceHandle) &&
            !Object.hasOwn(dynamic_outputs, edge.sourceHandle))
      )
      .map((edge) => edge.id);

    runAsOneUndoEntry(nodeStore, () => {
      updateNodeData(nodeId, {
        dynamic_inputs: nextDynamicInputs,
        dynamic_outputs,
        dynamic_properties: nextDynamicProperties
      });
      deleteEdges(staleEdgeIds);
    });
  }, [
    nodeId,
    nodeStore,
    deleteEdges,
    graph,
    data.dynamic_inputs,
    data.dynamic_outputs,
    data.dynamic_properties,
    updateNodeData
  ]);

  return null;
});

SubgraphSync.displayName = "SubgraphSync";
