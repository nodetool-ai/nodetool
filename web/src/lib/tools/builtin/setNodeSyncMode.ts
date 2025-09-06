import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_set_node_sync_mode",
  description:
    "Set a node's sync mode. 'on_any' processes when any input updates; 'zip_all' pairs inputs in lockstep.",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      mode: { type: "string", enum: ["on_any", "zip_all"] }
    },
    required: ["node_id", "mode"]
  },
  async execute({ node_id, mode }, ctx) {
    const { nodeStore } = ctx.getState();
    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, { sync_mode: mode });
    return { ok: true, node_id, mode };
  }
});

