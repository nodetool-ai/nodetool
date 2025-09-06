import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_move_node",
  description: "Move a node to an absolute canvas position.",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      position: {
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" } },
        required: ["x", "y"]
      }
    },
    required: ["node_id", "position"]
  },
  async execute({ node_id, position }, ctx) {
    const { nodeStore } = ctx.getState();
    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNode(node_id, { position });
    return { ok: true, node_id, position };
  }
});

