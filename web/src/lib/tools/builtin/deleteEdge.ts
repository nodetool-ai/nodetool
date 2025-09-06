import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_delete_edge",
  description: "Delete an edge by id from the current workflow graph.",
  parameters: {
    type: "object",
    properties: { edge_id: { type: "string" } },
    required: ["edge_id"]
  },
  async execute({ edge_id }, ctx) {
    const { nodeStore } = ctx.getState();
    const edge = nodeStore.findEdge(edge_id);
    if (!edge) throw new Error(`Edge not found: ${edge_id}`);
    nodeStore.deleteEdge(edge_id);
    return { ok: true, edge_id };
  }
});

