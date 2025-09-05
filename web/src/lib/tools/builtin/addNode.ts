import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_add_node",
  description: "Add a node to the current workflow graph.",
  parameters: {
    type: "object",
    properties: {
      node: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"]
          },
          data: { type: "object", additionalProperties: true }
        },
        required: ["id", "position"]
      }
    },
    required: ["node"]
  },
  async execute({ node }, ctx) {
    const state = ctx.getState();
    const nodes = Array.isArray(state.nodes) ? (state.nodes as any[]) : [];
    const edges = Array.isArray(state.edges) ? (state.edges as any[]) : [];
    const newNodes = [...nodes, node];
    state.updateGraph?.({ nodes: newNodes, edges });
    return { ok: true, nodes: newNodes.length };
  }
});
