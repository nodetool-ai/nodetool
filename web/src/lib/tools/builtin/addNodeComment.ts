import { FrontendToolRegistry } from "../frontendTools";
import { optionalWorkflowIdSchema, resolveWorkflowId } from "./workflow";

function assertString(value: any, message: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {throw new Error(message);}
}

FrontendToolRegistry.register({
  name: "ui_add_node_comment",
  description: "Add or update a comment on a node in the workflow.",
  parameters: {
    type: "object",
    properties: {
      node_id: {
        type: "string",
        description: "The ID of the node to add the comment to"
      },
      comment: {
        type: "string",
        description: "The comment text to add to the node"
      },
      workflow_id: optionalWorkflowIdSchema
    },
    required: ["node_id", "comment"]
  },
  async execute({ node_id, comment, workflow_id }, ctx) {
    const state = ctx.getState();
    const resolvedWorkflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(resolvedWorkflowId)?.getState();
    if (!nodeStore) {throw new Error(`No node store for workflow ${resolvedWorkflowId}`);}

    assertString(node_id, "Node ID must be a string");
    assertString(comment, "Comment must be a string");

    const node = nodeStore.findNode(node_id);
    if (!node) {throw new Error(`Node not found: ${node_id}`);}

    nodeStore.updateNodeData(node_id, {
      comment: comment.trim() || undefined
    });

    return { ok: true, node_id };
  }
});
