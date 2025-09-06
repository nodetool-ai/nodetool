import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_select_nodes",
  description: "Select nodes by ids (clears previous selection).",
  parameters: {
    type: "object",
    properties: {
      node_ids: { type: "array", items: { type: "string" } }
    },
    required: ["node_ids"]
  },
  async execute({ node_ids }, ctx) {
    const { nodeStore } = ctx.getState();
    const all = nodeStore.nodes;
    const updated = all.map((n: any) => ({ ...n, selected: node_ids.includes(n.id) }));
    nodeStore.setNodes(updated);
    return { ok: true, count: node_ids.length };
  }
});

