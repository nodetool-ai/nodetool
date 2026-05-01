import { z } from "zod";
import { uiSetNodeTitleParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_set_node_title",
  description: "Set a node's display title (ui property).",
  parameters: z.object(uiSetNodeTitleParams),
  async execute({ node_id, title, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${workflowId}`);}

    const node = nodeStore.findNode(node_id);
    if (!node) {throw new Error(`Node not found: ${node_id}`);}
    nodeStore.updateNodeData(node_id, { title });
    return { ok: true, node_id, title };
  }
});
