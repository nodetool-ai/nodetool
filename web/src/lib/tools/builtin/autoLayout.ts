// import { FrontendToolRegistry } from "../frontendTools";

// FrontendToolRegistry.register({
//   name: "ui_auto_layout",
//   description: "Run auto-layout for the current selection or entire graph.",
//   parameters: {
//     type: "object",
//     properties: {
//       scope: {
//         type: "string",
//         enum: ["selection", "all"],
//         description: "Currently informational; auto-layout uses selection when available."
//       },
//       workflow_id: { type: "string" }
//     }
//   },
//   async execute({ scope, workflow_id }, ctx) {
//     const state = ctx.getState();
//     const workflowId = workflow_id ?? state.currentWorkflowId;
//     if (!workflowId) throw new Error("No current workflow selected");
//     const nodeStore = state.getNodeStore(workflowId)?.getState();
//     if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

//     await nodeStore.autoLayout();
//     return { ok: true, scope: scope || null };
//   }
// });
