import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

FrontendToolRegistry.register({
  name: "ui_get_graph",
  description: "Read the current workflow graph (nodes and edges).",
  parameters: z.object({
    workflow_id: optionalWorkflowIdSchema
  }),
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const nodes = nodeStore.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data
    }));

    const edges = nodeStore.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    }));

    return {
      ok: true,
      workflow_id: workflowId,
      nodes,
      edges
    };
  }
});
