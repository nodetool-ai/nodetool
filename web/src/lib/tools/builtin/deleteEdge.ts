import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_delete_edge",
  description: "Delete an edge from the workflow graph.",
  requireUserConsent: true,
  parameters: z.object({
    edge_id: z.string(),
    workflow_id: optionalWorkflowIdSchema
  }),
  async execute({ edge_id, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const edge = nodeStore.findEdge(edge_id);
    if (!edge) {
      throw new Error(`Edge not found: ${edge_id}`);
    }

    nodeStore.deleteEdge(edge_id);
    return { ok: true, edge_id };
  }
});
