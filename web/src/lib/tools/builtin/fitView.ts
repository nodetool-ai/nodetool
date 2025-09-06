import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_fit_view",
  description: "Fit the current workflow graph to the viewport.",
  parameters: { type: "object", properties: {} },
  async execute(_args, ctx) {
    const { nodeStore } = ctx.getState();
    nodeStore.setShouldFitToScreen(true);
    return { ok: true };
  }
});

