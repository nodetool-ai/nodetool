import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_set_node_color",
  description: "Set a node's display color (ui property).",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      color: { type: "string" }
    },
    required: ["node_id", "color"]
  },
  async execute({ node_id, color }, ctx) {
    const { nodeStore } = ctx.getState();
    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, { color });
    return { ok: true, node_id, color };
  }
});

