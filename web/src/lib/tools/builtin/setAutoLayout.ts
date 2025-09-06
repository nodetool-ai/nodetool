import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_set_auto_layout",
  description: "Enable or disable auto-layout mode for the current workflow graph.",
  parameters: {
    type: "object",
    properties: {
      enabled: { type: "boolean" }
    },
    required: ["enabled"]
  },
  async execute({ enabled }, ctx) {
    const { nodeStore } = ctx.getState();
    nodeStore.setShouldAutoLayout(Boolean(enabled));
    return { ok: true, enabled: Boolean(enabled) };
  }
});

