import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_delete_node",
  description: "Delete a node from the current workflow graph.",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" }
    },
    required: ["node_id"]
  },
  async execute({ node_id }, ctx) {
    const { nodeStore } = ctx.getState();
    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.deleteNode(node_id);
    return { ok: true, node_id };
  }
});

