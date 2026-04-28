import { z } from "zod";
import { uiDeleteNodeParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_delete_node",
  description: "Delete a node from the workflow graph.",
  requireUserConsent: true,
  parameters: z.object(uiDeleteNodeParams),
  async execute({ node_id, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const node = nodeStore.findNode(node_id);
    if (!node) {
      throw new Error(`Node not found: ${node_id}`);
    }

    nodeStore.deleteNode(node_id);
    return { ok: true, node_id };
  }
});
