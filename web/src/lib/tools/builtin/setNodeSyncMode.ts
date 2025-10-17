import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_set_node_sync_mode",
  description:
    "Set a node's input processing mode. 'on_any' processes immediately when any input arrives; 'zip_all' waits for all inputs and processes them in matching pairs.",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      mode: { type: "string", enum: ["on_any", "zip_all"] },
      workflow_id: { type: "string" }
    },
    required: ["node_id", "mode"]
  },
  async execute({ node_id, mode, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = workflow_id ?? state.currentWorkflowId;
    if (!workflowId) throw new Error("No current workflow selected");
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, { sync_mode: mode });
    return { ok: true, node_id, mode };
  }
});
