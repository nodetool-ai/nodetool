import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_auto_layout",
  description: "Run auto-layout for the current selection or entire graph.",
  parameters: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["selection", "all"],
        description: "Currently informational; auto-layout uses selection when available."
      }
    }
  },
  async execute({ scope }, ctx) {
    const { nodeStore } = ctx.getState();
    await nodeStore.autoLayout();
    return { ok: true, scope: scope || null };
  }
});

