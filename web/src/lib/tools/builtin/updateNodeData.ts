import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_update_node_data",
  description: "Update a node's properties (data.properties).",
  parameters: z.object({
    node_id: z.string(),
    data: z.record(z.string(), z.any()),
    workflow_id: optionalWorkflowIdSchema
  }),
  async execute({ node_id, data, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    const node = nodeStore.findNode(node_id);
    if (!node) {throw new Error(`Node not found: ${node_id}`);}
    nodeStore.updateNodeData(node_id, data);
    return { ok: true, node_id };
  }
});
