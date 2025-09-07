import { FrontendToolRegistry } from "../frontendTools";

FrontendToolRegistry.register({
  name: "ui_select_nodes",
  description: "Select nodes by ids (clears previous selection).",
  parameters: {
    type: "object",
    properties: {
      node_ids: { type: "array", items: { type: "string" } },
      workflow_id: { type: "string" }
    },
    required: ["node_ids"]
  },
  async execute({ node_ids, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = workflow_id ?? state.currentWorkflowId;
    if (!workflowId) throw new Error("No current workflow selected");
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) throw new Error(`No node store for workflow ${workflowId}`);

    const all = nodeStore.nodes;
    const updated = all.map((n: any) => ({ ...n, selected: node_ids.includes(n.id) }));
    nodeStore.setNodes(updated);
    return { ok: true, count: node_ids.length };
  }
});
