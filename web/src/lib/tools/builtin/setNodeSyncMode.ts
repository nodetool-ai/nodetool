import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_set_node_sync_mode",
  description:
    "Set a node's input processing mode. 'on_any' processes immediately when any input arrives; 'zip_all' waits for all inputs and processes them in matching pairs.",
  hidden: true,
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      mode: { type: "string", enum: ["on_any", "zip_all"] },
      workflow_id: optionalWorkflowIdSchema
    },
    required: ["node_id", "mode"]
  },
  async execute({ node_id, mode, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, { sync_mode: mode });
    return { ok: true, node_id, mode };
  }
});
