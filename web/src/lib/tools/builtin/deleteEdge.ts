import { z } from "zod";
import { uiDeleteEdgeParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_delete_edge",
  description: "Delete an edge from the workflow graph.",
  requireUserConsent: true,
  parameters: z.object(uiDeleteEdgeParams),
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
