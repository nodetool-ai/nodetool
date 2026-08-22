import { z } from "zod";
import { uiConnectNodesParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { noNodeStoreError, resolveWorkflowId } from "./workflow";
import {
  findInputHandle,
  findOutputHandle,
  getAllInputHandles,
  getAllOutputHandles
} from "../../../utils/handleUtils";
import { isConnectable } from "../../../utils/TypeHandler";
import { wouldCreateCycle } from "../../../utils/graphCycle";
import { isCodeNodeType } from "../../../utils/codeNodeHandles";
import useMetadataStore from "../../../stores/MetadataStore";

/**
 * The hint every handle-not-found error carries for a Code node. Its ports are
 * inferred from the body, so a name the body never mentions does not exist —
 * one agent wired to `undesired_state` three times before reading that from an
 * error that only listed names. Property handles and dynamic handles are listed
 * separately because the property list (code, secrets, timeout…) reads like
 * noise next to the real ports.
 */
function codePortHint(): string {
  return (
    "On a nodetool.code.Code node, a dynamic port exists only once the body " +
    "reads inputs.<name> (or writes output(\"<name>\", …) — update the body " +
    "first with ui_update_node_data, then connect."
  );
}

function formatAvailableHandles(
  handles: readonly { name: string; isDynamic: boolean }[]
): string {
  const propertyHandles = handles.filter((h) => !h.isDynamic);
  const dynamicHandles = handles.filter((h) => h.isDynamic);
  const parts: string[] = [];
  if (dynamicHandles.length > 0) {
    parts.push(`ports: [${dynamicHandles.map((h) => h.name).join(", ")}]`);
  }
  if (propertyHandles.length > 0) {
    parts.push(`properties: [${propertyHandles.map((h) => h.name).join(", ")}]`);
  }
  return parts.join(" ") || "none";
}

FrontendToolRegistry.register({
  name: "ui_connect_nodes",
  description:
    "Connect two nodes by port name. Required: source/target node ids and handle (port) names. On a Code node, any name the body reads as `inputs.<name>` or `stream(\"<name>\")` is already a target handle — do not add a dynamic input first.",
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
      throw noNodeStoreError(state, workflowId);
    }

    const src = nodeStore.findNode(source_node_id);
    const tgt = nodeStore.findNode(target_node_id);
    if (!src) throw new Error(`Source node not found: ${source_node_id}`);
    if (!tgt) throw new Error(`Target node not found: ${target_node_id}`);
    if (!src.type) throw new Error(`Source node has no type: ${source_node_id}`);
    if (!tgt.type) throw new Error(`Target node has no type: ${target_node_id}`);

    const metadataStore = useMetadataStore.getState();
    const srcMetadata = metadataStore.getMetadata(src.type);
    const tgtMetadata = metadataStore.getMetadata(tgt.type);
    if (!srcMetadata) {
      throw new Error(`Source node has no metadata: ${src.type}`);
    }
    if (!tgtMetadata) {
      throw new Error(`Target node has no metadata: ${tgt.type}`);
    }

    const srcHandle = findOutputHandle(src, source_handle, srcMetadata);
    if (!srcHandle) {
      throw new Error(
        `Source handle '${source_handle}' not found on ${src.type} (id=${source_node_id}). ` +
          `Available outputs — ${formatAvailableHandles(getAllOutputHandles(src, srcMetadata))}.` +
          (isCodeNodeType(src.type) ? ` ${codePortHint()}` : "")
      );
    }

    const tgtHandle = findInputHandle(tgt, target_handle, tgtMetadata);
    if (!tgtHandle) {
      throw new Error(
        `Target handle '${target_handle}' not found on ${tgt.type} (id=${target_node_id}). ` +
          `Available inputs — ${formatAvailableHandles(getAllInputHandles(tgt, tgtMetadata))}.` +
          (isCodeNodeType(tgt.type) ? ` ${codePortHint()}` : "")
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
