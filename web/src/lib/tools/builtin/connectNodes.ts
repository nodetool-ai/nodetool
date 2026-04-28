import { z } from "zod";
import { uiConnectNodesParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";
import {
  findInputHandle,
  findOutputHandle,
  getAllInputHandles,
  getAllOutputHandles
} from "../../../utils/handleUtils";
import { isConnectable } from "../../../utils/TypeHandler";
import { wouldCreateCycle } from "../../../utils/graphCycle";
import useMetadataStore from "../../../stores/MetadataStore";

FrontendToolRegistry.register({
  name: "ui_connect_nodes",
  description:
    "Connect two nodes by port name. Required: source/target node ids and handle (port) names.",
  parameters: z.object(uiConnectNodesParams),
  async execute(
    {
      source_node_id,
      source_handle,
      target_node_id,
      target_handle,
      workflow_id
    },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const src = nodeStore.findNode(source_node_id);
    const tgt = nodeStore.findNode(target_node_id);
    if (!src) throw new Error(`Source node not found: ${source_node_id}`);
    if (!tgt) throw new Error(`Target node not found: ${target_node_id}`);

    const metadataStore = useMetadataStore.getState();
    const srcMetadata = metadataStore.getMetadata(src.type as string);
    const tgtMetadata = metadataStore.getMetadata(tgt.type as string);
    if (!srcMetadata) {
      throw new Error(`Source node has no metadata: ${src.type}`);
    }
    if (!tgtMetadata) {
      throw new Error(`Target node has no metadata: ${tgt.type}`);
    }

    const srcHandle = findOutputHandle(src, source_handle, srcMetadata);
    if (!srcHandle) {
      const available = getAllOutputHandles(src, srcMetadata)
        .map((h) => h.name)
        .join(", ");
      throw new Error(
        `Source handle '${source_handle}' not found on ${src.type} (id=${source_node_id}). Available outputs: [${available || "none"}]`
      );
    }

    const tgtHandle = findInputHandle(tgt, target_handle, tgtMetadata);
    if (!tgtHandle) {
      const available = getAllInputHandles(tgt, tgtMetadata)
        .map((h) => h.name)
        .join(", ");
      throw new Error(
        `Target handle '${target_handle}' not found on ${tgt.type} (id=${target_node_id}). Available inputs: [${available || "none"}]`
      );
    }

    const duplicate = nodeStore.edges.find(
      (edge) =>
        edge.source === source_node_id &&
        edge.sourceHandle === source_handle &&
        edge.target === target_node_id &&
        edge.targetHandle === target_handle
    );
    if (duplicate) {
      return { ok: true, edge_id: duplicate.id, note: "edge already exists" };
    }

    if (wouldCreateCycle(nodeStore.edges, source_node_id, target_node_id)) {
      throw new Error(
        `Connecting ${source_node_id} → ${target_node_id} would create a cycle.`
      );
    }

    if (!isConnectable(srcHandle.type, tgtHandle.type)) {
      throw new Error(
        `Type mismatch: source '${source_handle}' produces ${JSON.stringify(srcHandle.type)} but target '${target_handle}' expects ${JSON.stringify(tgtHandle.type)}.`
      );
    }

    const edgeId = nodeStore.generateEdgeId();
    nodeStore.addEdge({
      id: edgeId,
      source: source_node_id,
      target: target_node_id,
      sourceHandle: source_handle,
      targetHandle: target_handle
    });

    return { ok: true, edge_id: edgeId };
  }
});
