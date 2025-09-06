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
          data: {
            type: "object",
            properties: {
              properties: { type: "object", additionalProperties: true },
              dynamic_properties: {
                type: "object",
                additionalProperties: true
              },
              dynamic_outputs: { type: "object", additionalProperties: true },
              sync_mode: {
                type: "string",
                default: "on_any",
                enum: ["on_any", "zip_all"]
              }
            },
            additionalProperties: true
          }
        },
        required: ["id", "position"]
      }
    },
    required: ["node"]
  },
  async execute({ node }, ctx) {
    const state = ctx.getState();
    state.nodeStore.addNode(node);
    return { ok: true };
  }
});
