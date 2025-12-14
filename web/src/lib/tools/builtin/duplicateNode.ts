// import { FrontendToolRegistry } from "../frontendTools";

// FrontendToolRegistry.register({
//   name: "ui_duplicate_node",
//   description: "Duplicate a node with a new id and slight position offset.",
//   parameters: {
//     type: "object",
//     properties: {
//       node_id: { type: "string" },
//       offset: {
//         type: "object",
//         properties: { x: { type: "number" }, y: { type: "number" } },
//         default: { x: 20, y: 20 }
//       },
//       workflow_id: { type: "string" }
//     },
//     required: ["node_id"]
//   },
//   async execute({ node_id, offset, workflow_id }, ctx) {
//     const state = ctx.getState();
//     const workflowId = workflow_id ?? state.currentWorkflowId;
//     if (!workflowId) throw new Error("No current workflow selected");
//     const nodeStore = state.getNodeStore(workflowId)?.getState();
//     if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

//     const src = nodeStore.findNode(node_id) as any;
//     if (!src) throw new Error(`Node not found: ${node_id}`);

//     const dx = Number(offset?.x ?? 20);
//     const dy = Number(offset?.y ?? 20);

//     const newId = nodeStore.generateNodeId();
//     const clone = {
//       ...src,
//       id: newId,
//       position: { x: src.position.x + dx, y: src.position.y + dy },
//       selected: false
//     } as any;

//     nodeStore.addNode(clone);
//     return { ok: true, node_id: newId };
//   }
// });
