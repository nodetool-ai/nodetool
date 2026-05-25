import { memo, useEffect } from "react";
import isEqual from "fast-deep-equal";
import { useNodes } from "../../../contexts/NodeContext";
import {
  extractDynamicIO,
  INPUT_TYPE_MAP,
  OUTPUT_TYPE_MAP
} from "../WorkflowNode";
import type { NodeData } from "../../../stores/NodeData";
import type { Workflow } from "../../../stores/ApiTypes";

interface SubgraphSyncProps {
  nodeId: string;
  data: NodeData;
}

/**
 * Watches the SubgraphNode's `graph` property and keeps the node's
 * dynamic_inputs / dynamic_outputs / dynamic_properties in sync with the
 * inner Input/Output nodes. The same IO extraction logic used by WorkflowNode
 * is reused — boundary ports are identified by node type prefix
 * (`nodetool.input.*` / `nodetool.output.*`).
 */
export const SubgraphSync = memo(({ nodeId, data }: SubgraphSyncProps) => {
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const graph = data.properties?.graph as
    | { nodes?: unknown[]; edges?: unknown[] }
    | undefined;

  useEffect(() => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph?.edges) ? graph.edges : [];

    const { dynamic_inputs, dynamic_outputs, dynamic_properties } =
      extractDynamicIO({ graph: { nodes, edges } } as unknown as Workflow);

    const nextDynamicInputs =
      Object.keys(dynamic_inputs).length > 0 ? dynamic_inputs : undefined;

    if (
      isEqual(data.dynamic_inputs, nextDynamicInputs) &&
      isEqual(data.dynamic_outputs ?? {}, dynamic_outputs) &&
      isEqual(data.dynamic_properties ?? {}, dynamic_properties)
    ) {
      return;
    }

    updateNodeData(nodeId, {
      dynamic_inputs: nextDynamicInputs,
      dynamic_outputs,
      dynamic_properties
    });
  }, [
    nodeId,
    graph,
    data.dynamic_inputs,
    data.dynamic_outputs,
    data.dynamic_properties,
    updateNodeData
  ]);

  return null;
});

SubgraphSync.displayName = "SubgraphSync";

export { INPUT_TYPE_MAP, OUTPUT_TYPE_MAP };
