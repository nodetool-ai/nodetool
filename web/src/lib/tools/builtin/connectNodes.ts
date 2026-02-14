import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_connect_nodes",
  description:
    "Connect two nodes by handles. Requires source/target ids and handles.",
  parameters: z.object({
    source_id: z.string(),
    source_handle: z.string(),
    target_id: z.string(),
    target_handle: z.string(),
    workflow_id: optionalWorkflowIdSchema
  }),
  async execute(
    { source_id, source_handle, target_id, target_handle, workflow_id },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    const src = nodeStore.findNode(source_id);
    const tgt = nodeStore.findNode(target_id);
    if (!src) {throw new Error(`Source node not found: ${source_id}`);}
    if (!tgt) {throw new Error(`Target node not found: ${target_id}`);}

    const connection = {
      source: source_id,
      target: target_id,
      sourceHandle: source_handle,
      targetHandle: target_handle
    } as any;

    const ok = nodeStore.validateConnection(connection, src as any, tgt as any);
    if (!ok) {throw new Error("Invalid connection");}

    const edgeId = nodeStore.generateEdgeId();
    nodeStore.addEdge({
      id: edgeId,
      source: source_id,
      target: target_id,
      sourceHandle: source_handle,
      targetHandle: target_handle
    } as any);

    return { ok: true, edge_id: edgeId };
  }
});
