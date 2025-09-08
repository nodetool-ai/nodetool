import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_fit_view",
  description: "Fit the current workflow graph to the viewport.",
  parameters: { type: "object", properties: { workflow_id: { type: "string" } } },
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = workflow_id ?? state.currentWorkflowId;
    if (!workflowId) throw new Error("No current workflow selected");
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

    nodeStore.setShouldFitToScreen(true);
    return { ok: true };
  }
});
