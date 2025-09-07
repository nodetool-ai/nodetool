import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_set_node_title",
  description: "Set a node's display title (ui property).",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      title: { type: "string" },
      workflow_id: { type: "string" }
    },
    required: ["node_id", "title"]
  },
  async execute({ node_id, title, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = workflow_id ?? state.currentWorkflowId;
    if (!workflowId) throw new Error("No current workflow selected");
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, { title });
    return { ok: true, node_id, title };
  }
});
