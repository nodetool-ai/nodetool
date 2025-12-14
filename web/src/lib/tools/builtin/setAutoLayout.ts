// import { FrontendToolRegistry } from "../frontendTools";

// FrontendToolRegistry.register({
//   name: "ui_set_auto_layout",
//   description: "Enable or disable auto-layout mode for the current workflow graph.",
//   parameters: {
//     type: "object",
//     properties: {
//       enabled: { type: "boolean" },
//       workflow_id: { type: "string" }
//     },
//     required: ["enabled"]
//   },
//   async execute({ enabled, workflow_id }, ctx) {
//     const state = ctx.getState();
//     const workflowId = workflow_id ?? state.currentWorkflowId;
//     if (!workflowId) throw new Error("No current workflow selected");
//     const nodeStore = state.getNodeStore(workflowId)?.getState();
//     if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

//     nodeStore.setShouldAutoLayout(Boolean(enabled));
//     return { ok: true, enabled: Boolean(enabled) };
//   }
// });
