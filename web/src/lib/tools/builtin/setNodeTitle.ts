import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_set_node_title",
  description: "Set a node's display title (ui property).",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      title: { type: "string" },
      workflow_id: optionalWorkflowIdSchema
    },
    required: ["node_id", "title"]
  },
  async execute({ node_id, title, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, { title });
    return { ok: true, node_id, title };
  }
});
