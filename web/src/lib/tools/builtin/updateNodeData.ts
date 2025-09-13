import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_update_node_data",
  description: "Update a node's properties (data.properties).",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      data: { type: "object", additionalProperties: true },
      workflow_id: { type: "string" }
    },
    required: ["node_id", "data"]
  },
  async execute({ node_id, data, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = workflow_id ?? state.currentWorkflowId;
    if (!workflowId) throw new Error("No current workflow selected");
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, data);
    return { ok: true, node_id };
  }
});
