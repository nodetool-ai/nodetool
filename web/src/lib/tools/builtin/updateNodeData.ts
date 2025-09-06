import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_update_node_data",
  description: "Update a node's properties (data.properties).",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      data: { type: "object", additionalProperties: true }
    },
    required: ["node_id", "data"]
  },
  async execute({ node_id, data }, ctx) {
    const { nodeStore } = ctx.getState();
    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, data);
    return { ok: true, node_id };
  }
});

