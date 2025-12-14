import { FrontendToolRegistry } from "../frontendTools";

// FrontendToolRegistry.register({
//   name: "ui_move_node",
//   description: "Move a node to an absolute canvas position.",
//   parameters: {
//     type: "object",
//     properties: {
//       node_id: { type: "string" },
//       position: {
//         type: "object",
//         properties: { x: { type: "number" }, y: { type: "number" } },
//         required: ["x", "y"]
//       },
//       workflow_id: { type: "string" }
//     },
//     required: ["node_id", "position"]
//   },
//   async execute({ node_id, position, workflow_id }, ctx) {
//     const state = ctx.getState();
//     const workflowId = workflow_id ?? state.currentWorkflowId;
//     if (!workflowId) throw new Error("No current workflow selected");
//     const nodeStore = state.getNodeStore(workflowId)?.getState();
//     if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

//     const node = nodeStore.findNode(node_id);
//     if (!node) throw new Error(`Node not found: ${node_id}`);
//     nodeStore.updateNode(node_id, { position });
//     return { ok: true, node_id, position };
//   }
// });
