import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_set_node_title",
  description: "Set a node's display title (ui property).",
  parameters: {
    type: "object",
    properties: {
      node_id: { type: "string" },
      title: { type: "string" }
    },
    required: ["node_id", "title"]
  },
  async execute({ node_id, title }, ctx) {
    const { nodeStore } = ctx.getState();
    const node = nodeStore.findNode(node_id);
    if (!node) throw new Error(`Node not found: ${node_id}`);
    nodeStore.updateNodeData(node_id, { title });
    return { ok: true, node_id, title };
  }
});

